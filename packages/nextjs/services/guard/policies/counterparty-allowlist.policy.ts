import { extractTransferDetails } from "../extract";
import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

export class CounterpartyAllowlistPolicy extends AbstractPolicy {
  name = "CounterpartyAllowlistPolicy";
  description = "Restricts agent transfers to only approved counterparty account IDs";
  relevantTools = ["transfer_hbar", "transfer_fungible_token", "crypto_transfer", "vault_pay"];

  constructor(private allowedAccounts: string[]) {
    super();
  }

  protected shouldBlockPreToolExecution(params: any, method: string): boolean {
    if (!this.relevantTools.includes(method)) return false;

    const details = extractTransferDetails(params?.rawParams);
    if (!details.to) return false;

    const allowed = this.allowedAccounts.some(acc => acc.trim() === details.to);
    if (!allowed) {
      throw new Error(
        `[CounterpartyAllowlistPolicy] Blocked ${method}: recipient "${details.to}" is not authorized. Allowed counterparties: [${this.allowedAccounts.join(", ")}]`,
      );
    }

    return false;
  }
}
