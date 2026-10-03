import { submitAuditRecord } from "../audit";
import { extractTransferDetails } from "../extract";
import { SpendAuditRecord, SpendStore, hbarToTinybar } from "../types";
import { AbstractHook } from "@hashgraph/hedera-agent-kit";
import { Client } from "@hiero-ledger/sdk";

export class SpendAuditHook extends AbstractHook {
  name = "SpendAuditHook";
  description = "Commits atomic spend holds and publishes immutable decision logs to HCS on tool completion";
  relevantTools = ["transfer_hbar", "transfer_fungible_token", "crypto_transfer", "vault_pay"];

  constructor(
    private client: Client | null | undefined,
    private agentAccountId: string,
    private auditTopicId: string | undefined,
    private store: SpendStore,
  ) {
    super();
  }

  async postToolExecutionHook(params: any, method: string): Promise<void> {
    if (!this.relevantTools.includes(method)) return;

    const holdId = params?.context?.__currentSpendHoldId;
    const details = extractTransferDetails(params?.rawParams);
    const amountHbar = details.amountHbar || 0;
    const amountTinybar = hbarToTinybar(amountHbar);
    const recipient = details.to || "unknown";

    const txId = params?.toolResult?.transactionId || params?.toolResult?.txId;
    const isError = Boolean(params?.toolResult?.error || params?.error);

    try {
      if (isError) {
        // Tool failed or was blocked; release the hold
        if (holdId) {
          await this.store.releaseHold(holdId);
        }

        const auditRecord: SpendAuditRecord = {
          id: `audit_blk_${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: method,
          decision: "BLOCK",
          recipient,
          amountHbar,
          amountTinybar: amountTinybar.toString(),
          reason: params?.toolResult?.error || params?.error?.message || "Tool execution failed",
          enforcement: "offchain",
          agentAccountId: this.agentAccountId,
        };

        await this.store.recordDecision(auditRecord);
        await submitAuditRecord(this.client, this.auditTopicId, auditRecord);
      } else {
        // Tool succeeded; commit the hold into permanent spend history
        if (holdId) {
          await this.store.commitHold(holdId);
        }

        const auditRecord: SpendAuditRecord = {
          id: `audit_alw_${Date.now()}`,
          timestamp: new Date().toISOString(),
          action: method,
          decision: "ALLOW",
          recipient,
          amountHbar,
          amountTinybar: amountTinybar.toString(),
          reason: "Payment verified against allowlist and budget ceilings",
          txId: typeof txId === "string" ? txId : undefined,
          enforcement: "offchain",
          agentAccountId: this.agentAccountId,
        };

        await this.store.recordDecision(auditRecord);
        await submitAuditRecord(this.client, this.auditTopicId, auditRecord);
      }
    } catch (err) {
      console.warn(`[SpendAuditHook] Non-fatal audit recording warning: ${err}`);
    } finally {
      if (params?.context) {
        delete params.context.__currentSpendHoldId;
      }
    }
  }
}
