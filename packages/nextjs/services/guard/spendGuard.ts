import { loadYamlConfig } from "../config/yamlConfig";
import { createAuditTopic, submitAuditRecord } from "./audit";
import { SpendAuditHook } from "./hooks/spend-audit.hook";
import { ApprovalTierPolicy } from "./policies/approval-tier.policy";
import { CounterpartyAllowlistPolicy } from "./policies/counterparty-allowlist.policy";
import { SpendLimitPolicy } from "./policies/spend-limit.policy";
import { createScheduledPayment } from "./scheduling";
import { getDefaultSpendStore } from "./store";
import {
  PaymentParams,
  PaymentResult,
  SpendAuditRecord,
  SpendGuardConfig,
  SpendStore,
  hbarToTinybar,
  tinybarToHbar,
} from "./types";
import { executeVaultPayment } from "./vault";
import { RejectToolPolicy } from "@hashgraph/hedera-agent-kit/policies";
import { AccountId, Client, Hbar, PrivateKey, TransferTransaction } from "@hiero-ledger/sdk";

export interface CreateSpendGuardOptions extends Partial<SpendGuardConfig> {
  client?: Client;
  store?: SpendStore;
}

export class SpendGuard {
  readonly config: SpendGuardConfig;
  readonly resolvedMode: "offchain" | "vault";
  readonly store: SpendStore;
  readonly client?: Client;

  constructor(options?: CreateSpendGuardOptions) {
    const yamlConfig = loadYamlConfig();

    const agentAccountId = options?.agentAccountId || process.env.AGENT_ACCOUNT_ID || "0.0.X";

    const vaultAddress =
      options?.vaultAddress ||
      yamlConfig.vault?.address ||
      process.env.VAULT_CONTRACT_ID ||
      process.env.NEXT_PUBLIC_VAULT_ADDRESS;

    const requestedMode = options?.mode || (yamlConfig.agent.mode as any) || "auto";

    // Auto-detect enforcement mode:
    // If mode is 'vault', or mode is 'auto' and vaultAddress is present -> 'vault'
    // Otherwise -> 'offchain'
    if (requestedMode === "vault" || (requestedMode === "auto" && vaultAddress && vaultAddress !== "0.0.X")) {
      this.resolvedMode = "vault";
    } else {
      this.resolvedMode = "offchain";
    }

    this.config = {
      agentAccountId,
      mode: requestedMode,
      vaultAddress,
      perTaskCapHbar: options?.perTaskCapHbar ?? yamlConfig.spendGuard.caps.perTaskHbar,
      perDayCapHbar: options?.perDayCapHbar ?? yamlConfig.spendGuard.caps.perDayHbar,
      autoApprovalLimitHbar: options?.autoApprovalLimitHbar ?? yamlConfig.spendGuard.caps.autoApprovalLimitHbar,
      allowlist: options?.allowlist ?? yamlConfig.spendGuard.allowlist,
      blockedTools: options?.blockedTools ?? yamlConfig.spendGuard.blockedTools,
      auditTopicId: options?.auditTopicId ?? yamlConfig.hcs.auditTopicId,
      policyTopicId: options?.policyTopicId ?? yamlConfig.hcs.policyTopicId,
      customFeeTinybar: options?.customFeeTinybar ?? yamlConfig.hcs.customFeeTinybar,
      holdTtlMs: options?.holdTtlMs ?? 60000,
      rollingWindowMs: options?.rollingWindowMs ?? 24 * 60 * 60 * 1000,
    };

    this.store = options?.store || getDefaultSpendStore();

    if (options?.client) {
      this.client = options.client;
    } else if (process.env.HEDERA_ACCOUNT_ID && process.env.HEDERA_PRIVATE_KEY) {
      try {
        const c = Client.forTestnet();
        const priv = process.env.HEDERA_PRIVATE_KEY.startsWith("30")
          ? PrivateKey.fromStringDer(process.env.HEDERA_PRIVATE_KEY)
          : process.env.HEDERA_PRIVATE_KEY.startsWith("0x")
            ? PrivateKey.fromStringECDSA(process.env.HEDERA_PRIVATE_KEY)
            : PrivateKey.fromString(process.env.HEDERA_PRIVATE_KEY);
        c.setOperator(AccountId.fromString(process.env.HEDERA_ACCOUNT_ID), priv);
        this.client = c;
      } catch {
        this.client = undefined;
      }
    } else {
      this.client = undefined;
    }
  }

  /**
   * Returns lifecycle hooks and policies for direct integration with @hashgraph/hedera-agent-kit agents.
   * Drop straight into agent configuration:
   * new HederaLangchainToolkit({ client, configuration: { context: { hooks: spendGuard.getAgentKitHooks() } } });
   */
  getAgentKitHooks(): any[] {
    return [
      new RejectToolPolicy(this.config.blockedTools),
      new CounterpartyAllowlistPolicy(this.config.allowlist),
      new SpendLimitPolicy(this.config.agentAccountId, this.config.perDayCapHbar, this.store),
      new ApprovalTierPolicy(
        this.client,
        this.config.agentAccountId,
        this.config.perTaskCapHbar,
        this.config.auditTopicId,
        this.store,
      ),
      new SpendAuditHook(this.client, this.config.agentAccountId, this.config.auditTopicId, this.store),
    ];
  }

  /**
   * Programmatic payment executor for direct Next.js Route Handlers and machine-to-machine x402 endpoints.
   * Performs allowlist validation, budget reservations, HITL escalation, and on-chain or off-chain execution.
   */
  async executePayment(params: PaymentParams): Promise<PaymentResult> {
    const { to, amountHbar, memo } = params;
    const amountTinybar = hbarToTinybar(amountHbar);
    const nowIso = new Date().toISOString();

    // 1. Check Allowlist
    const isAllowed = this.config.allowlist.some(acc => acc.trim() === to.trim());
    if (!isAllowed) {
      const reason = `Recipient "${to}" is not authorized in counterparty allowlist [${this.config.allowlist.join(", ")}]`;
      const record: SpendAuditRecord = {
        id: `audit_blk_${Date.now()}`,
        timestamp: nowIso,
        action: "executePayment",
        decision: "BLOCK",
        recipient: to,
        amountHbar,
        amountTinybar: amountTinybar.toString(),
        reason,
        enforcement: this.resolvedMode,
        agentAccountId: this.config.agentAccountId,
      };

      await this.store.recordDecision(record);
      await submitAuditRecord(this.client, this.config.auditTopicId, record);

      return {
        success: false,
        decision: "BLOCK",
        reason,
        enforcement: this.resolvedMode,
        auditRecord: record,
      };
    }

    // 2. Check Per-Task Cap & HITL Escalation (HIP-423)
    if (amountHbar > this.config.perTaskCapHbar) {
      const scheduleResult = await createScheduledPayment(this.client, {
        payerAccountId: params.payerAccountId || this.config.agentAccountId,
        recipientAccountId: to,
        amountTinybar,
        memo: memo || "spend-guard:hitl-approval",
      });

      const reason = `Payment amount (${amountHbar} HBAR) exceeds per-task cap (${this.config.perTaskCapHbar} HBAR). Generated HIP-423 scheduled transaction ${scheduleResult.scheduleId} awaiting human approval.`;

      const record: SpendAuditRecord = {
        id: `audit_esc_${Date.now()}`,
        timestamp: nowIso,
        action: "executePayment",
        decision: "ESCALATE",
        recipient: to,
        amountHbar,
        amountTinybar: amountTinybar.toString(),
        reason,
        scheduleId: scheduleResult.scheduleId,
        enforcement: this.resolvedMode,
        agentAccountId: this.config.agentAccountId,
      };

      await this.store.recordDecision(record);
      await submitAuditRecord(this.client, this.config.auditTopicId, record);

      return {
        success: false,
        decision: "ESCALATE",
        scheduleId: scheduleResult.scheduleId,
        reason,
        enforcement: this.resolvedMode,
        auditRecord: record,
      };
    }

    // 3. Check Rolling 24-hour Cap & Reserve Atomic Hold
    const perDayCapTinybar = hbarToTinybar(this.config.perDayCapHbar);
    const holdResult = await this.store.reserveHold(
      this.config.agentAccountId,
      amountTinybar,
      perDayCapTinybar,
      this.config.holdTtlMs,
    );

    if (!holdResult.allowed || !holdResult.holdId) {
      const reason = holdResult.reason || "Daily spending cap exceeded";
      const record: SpendAuditRecord = {
        id: `audit_blk_${Date.now()}`,
        timestamp: nowIso,
        action: "executePayment",
        decision: "BLOCK",
        recipient: to,
        amountHbar,
        amountTinybar: amountTinybar.toString(),
        reason,
        enforcement: this.resolvedMode,
        agentAccountId: this.config.agentAccountId,
      };

      await this.store.recordDecision(record);
      await submitAuditRecord(this.client, this.config.auditTopicId, record);

      return {
        success: false,
        decision: "BLOCK",
        reason,
        enforcement: this.resolvedMode,
        auditRecord: record,
      };
    }

    const holdId = holdResult.holdId;

    // 4. Execute Payment (L2 Vault or L0/L1 Off-Chain)
    try {
      let txId: string | undefined;

      if (this.resolvedMode === "vault") {
        if (!this.config.vaultAddress) {
          throw new Error("Vault address not configured for vault enforcement mode");
        }
        const vaultRes = await executeVaultPayment(this.client, {
          vaultContractId: this.config.vaultAddress,
          recipient: to,
          amountTinybar,
        });

        if (!vaultRes.success) {
          throw new Error(vaultRes.error || "Vault payment reverted in consensus");
        }
        txId = vaultRes.txId;
      } else {
        // Off-Chain execution: Native Hedera CryptoTransfer
        if (this.client && this.client.operatorAccountId) {
          const tx = new TransferTransaction()
            .addHbarTransfer(this.config.agentAccountId, Hbar.fromTinybars((-amountTinybar).toString()))
            .addHbarTransfer(to, Hbar.fromTinybars(amountTinybar.toString()));
          if (memo) tx.setTransactionMemo(memo);

          const response = await tx.execute(this.client);
          const receipt = await response.getReceipt(this.client);
          if (receipt.status.toString() !== "SUCCESS") {
            throw new Error(`Transfer failed with status: ${receipt.status.toString()}`);
          }
          txId = response.transactionId.toString();
        } else {
          // Offline stub for unit tests
          txId = `offline-tx-${Date.now()}`;
        }
      }

      // Success: Commit hold into permanent rolling spend history
      await this.store.commitHold(holdId);

      const record: SpendAuditRecord = {
        id: `audit_alw_${Date.now()}`,
        timestamp: nowIso,
        action: "executePayment",
        decision: "ALLOW",
        recipient: to,
        amountHbar,
        amountTinybar: amountTinybar.toString(),
        reason: "Payment verified against allowlist and budget ceilings",
        txId,
        enforcement: this.resolvedMode,
        agentAccountId: this.config.agentAccountId,
      };

      await this.store.recordDecision(record);
      await submitAuditRecord(this.client, this.config.auditTopicId, record);

      return {
        success: true,
        decision: "ALLOW",
        txId,
        enforcement: this.resolvedMode,
        auditRecord: record,
      };
    } catch (err: any) {
      // Payment failed or reverted; release the hold so budget isn't permanently locked
      await this.store.releaseHold(holdId);

      const reason = err?.message || "Payment execution failed";
      const record: SpendAuditRecord = {
        id: `audit_blk_${Date.now()}`,
        timestamp: nowIso,
        action: "executePayment",
        decision: "BLOCK",
        recipient: to,
        amountHbar,
        amountTinybar: amountTinybar.toString(),
        reason,
        enforcement: this.resolvedMode,
        agentAccountId: this.config.agentAccountId,
      };

      await this.store.recordDecision(record);
      await submitAuditRecord(this.client, this.config.auditTopicId, record);

      return {
        success: false,
        decision: "BLOCK",
        reason,
        enforcement: this.resolvedMode,
        auditRecord: record,
      };
    }
  }

  async getDailySpent(): Promise<number> {
    const tinybar = await this.store.getDailySpent(this.config.agentAccountId);
    return tinybarToHbar(tinybar);
  }

  async getAuditHistory(limit = 50): Promise<SpendAuditRecord[]> {
    return this.store.getAuditHistory(limit);
  }

  /**
   * Helper to provision a live HCS audit topic on Hedera if needed.
   */
  async provisionAuditTopic(options?: { memo?: string; customFeeTinybar?: number }): Promise<string> {
    if (!this.client) {
      throw new Error("Hedera Client is required to provision an HCS topic");
    }
    const topicId = await createAuditTopic(this.client, {
      memo: options?.memo || this.config.auditTopicId || "agent-spend-audit",
      customFeeTinybar: options?.customFeeTinybar ?? this.config.customFeeTinybar,
    });
    this.config.auditTopicId = topicId;
    return topicId;
  }
}

/**
 * Factory helper for initializing SpendGuard out of the box with zero boilerplate.
 */
export function createSpendGuard(options?: CreateSpendGuardOptions): SpendGuard {
  return new SpendGuard(options);
}
