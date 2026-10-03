import { extractTransferDetails } from "../extract";
import { SpendStore, hbarToTinybar } from "../types";
import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

export class SpendLimitPolicy extends AbstractPolicy {
  name = "SpendLimitPolicy";
  description = "Enforces rolling 24-hour spending caps using atomic reservations";
  relevantTools = ["transfer_hbar", "transfer_fungible_token", "crypto_transfer", "vault_pay"];

  constructor(
    private agentAccountId: string,
    private perDayCapHbar: number,
    private store: SpendStore,
  ) {
    super();
  }

  protected async shouldBlockPreToolExecution(params: any, method: string): Promise<boolean> {
    if (!this.relevantTools.includes(method)) return false;

    const details = extractTransferDetails(params?.rawParams);
    if (!details.amountHbar || details.amountHbar <= 0) return false;

    const amountTinybar = hbarToTinybar(details.amountHbar);
    const perDayCapTinybar = hbarToTinybar(this.perDayCapHbar);

    const reservation = await this.store.reserveHold(this.agentAccountId, amountTinybar, perDayCapTinybar);

    if (!reservation.allowed) {
      throw new Error(`[SpendLimitPolicy] Blocked ${method}: ${reservation.reason || "Daily spending cap exceeded"}`);
    }

    // Attach holdId to context scratchpad so SpendAuditHook can commit or release it
    if (params?.context && reservation.holdId) {
      (params.context as any).__currentSpendHoldId = reservation.holdId;
    }

    return false;
  }
}
