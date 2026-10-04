import { REGISTER_AGENT_TOOL, RegisterAgentTool } from "./tools/register-agent.tool";
import { VALIDATE_AGENT_TOOL, ValidateAgentTool } from "./tools/validate-agent.tool";
import { VERIFY_AGENT_SIGNATURE_TOOL, VerifyAgentSignatureTool } from "./tools/verify-signature.tool";
import { Context, Plugin, Tool } from "@hashgraph/hedera-agent-kit";

export {
  REGISTER_AGENT_TOOL,
  VALIDATE_AGENT_TOOL,
  VERIFY_AGENT_SIGNATURE_TOOL,
  RegisterAgentTool,
  ValidateAgentTool,
  VerifyAgentSignatureTool,
};

export const agentTrustPlugin: Plugin = {
  name: "agent-trust-plugin",
  version: "1.0.0",
  description: "Native ERC-8004 decentralized identity registry, verification, and trust tools for Hedera agents",
  tools: (context: Context = {}): Tool[] => [
    new RegisterAgentTool(context),
    new ValidateAgentTool(context),
    new VerifyAgentSignatureTool(context),
  ],
};
