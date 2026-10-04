import { agentRegistry } from "../../trust/registry";
import { extractTransferDetails } from "../extract";
import { AbstractPolicy } from "@hashgraph/hedera-agent-kit";

export interface TrustedAgentPolicyConfig {
  strict?: boolean;
  exemptRecipients?: string[];
}

/**
 * Spend Guard policy that validates counterparty identity against the Agent Registry.
 * Prevents agents from sending micro-settlements or task payments to untrusted or unregistered accounts.
 */
export class TrustedAgentPolicy extends AbstractPolicy {
  name = "TrustedAgentPolicy";
  description = "Verifies that transfer recipients are registered, authentic agents in the identity registry";
  relevantTools = ["transfer_hbar", "transfer_fungible_token", "crypto_transfer", "vault_pay"];

  private strict: boolean;
  private exemptRecipients: Set<string>;

  constructor(config?: TrustedAgentPolicyConfig) {
    super();
    this.strict = config?.strict ?? true;
    this.exemptRecipients = new Set((config?.exemptRecipients || []).map(r => r.toLowerCase()));
  }

  protected async shouldBlockPreToolExecution(params: any, method: string): Promise<boolean> {
    if (!this.relevantTools.includes(method)) return false;

    const details = extractTransferDetails(params?.rawParams);
    if (!details.to) return false;

    const recipient = details.to.toLowerCase();

    // Check exemption list first (e.g. system topics, faucet, owner vault)
    if (this.exemptRecipients.has(recipient)) {
      return false;
    }

    const isRegistered = await agentRegistry.isAgentRegistered(recipient);

    if (!isRegistered && this.strict) {
      throw new Error(
        `[TrustedAgentPolicy] Blocked ${method}: Recipient ${details.to} is not a verified agent in the identity registry`,
      );
    }

    return false;
  }
}
