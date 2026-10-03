import { submitAuditRecord } from "../audit";
import { extractTransferDetails } from "../extract";
import { createScheduledPayment } from "../scheduling";
import { SpendAuditRecord, SpendStore, hbarToTinybar } from "../types";
import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";
import { Client } from "@hiero-ledger/sdk";

export class ApprovalTierPolicy extends AbstractPolicy {
  name = "ApprovalTierPolicy";
  description =
    "Enforces per-task limits and escalates excessive payments to HIP-423 scheduled transactions for human approval";
  relevantTools = ["transfer_hbar", "transfer_fungible_token", "crypto_transfer", "vault_pay"];

  constructor(
    private client: Client | null | undefined,
    private payerAccountId: string,
    private perTaskCapHbar: number,
    private auditTopicId: string | undefined,
    private store: SpendStore,
  ) {
    super();
  }

  protected async shouldBlockPreToolExecution(params: any, method: string): Promise<boolean> {
    if (!this.relevantTools.includes(method)) return false;

    const details = extractTransferDetails(params?.rawParams);
    if (!details.amountHbar || details.amountHbar <= 0) return false;

    if (details.amountHbar > this.perTaskCapHbar) {
      const amountTinybar = hbarToTinybar(details.amountHbar);
      const recipient = details.to || "unknown";

      // Authentic HIP-423 scheduled transaction creation
      const scheduleResult = await createScheduledPayment(this.client, {
        payerAccountId: this.payerAccountId,
        recipientAccountId: recipient,
        amountTinybar,
        memo: details.memo || "spend-guard:hitl-approval",
      });

      const auditRecord: SpendAuditRecord = {
        id: `audit_esc_${Date.now()}`,
        timestamp: new Date().toISOString(),
        action: method,
        decision: "ESCALATE",
        recipient,
        amountHbar: details.amountHbar,
        amountTinybar: amountTinybar.toString(),
        reason: `Payment amount (${details.amountHbar} HBAR) exceeds per-task cap (${this.perTaskCapHbar} HBAR). Created on-chain HIP-423 schedule for owner approval.`,
        scheduleId: scheduleResult.scheduleId,
        enforcement: "offchain",
        agentAccountId: this.payerAccountId,
      };

      await this.store.recordDecision(auditRecord);
      await submitAuditRecord(this.client, this.auditTopicId, auditRecord);

      throw new Error(
        `[ApprovalTierPolicy] Escalated ${method}: Amount ${details.amountHbar} HBAR exceeds auto-approval cap (${this.perTaskCapHbar} HBAR). Generated Hedera scheduled transaction ${scheduleResult.scheduleId} awaiting human owner signature.`,
      );
    }

    return false;
  }
}
