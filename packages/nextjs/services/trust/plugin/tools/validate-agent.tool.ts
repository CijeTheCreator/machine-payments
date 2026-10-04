import { agentRegistry } from "../../registry";
import { BaseTool, Context, TOOL_TYPE, ToolType } from "@hashgraph/hedera-agent-kit";
import { Client } from "@hiero-ledger/sdk";
import { z } from "zod";

export const VALIDATE_AGENT_TOOL = "validate_agent_tool";

const validateAgentParameters = z.object({
  target: z.string().min(1).describe("DID or EVM address of the agent to query and validate"),
});

type ValidateAgentParams = z.infer<typeof validateAgentParameters>;

export class ValidateAgentTool extends BaseTool<ValidateAgentParams, ValidateAgentParams> {
  method = VALIDATE_AGENT_TOOL;
  name = "Validate Agent Identity";
  description =
    "Validates if an agent exists in the Identity Registry and retrieves its profile, DID, and service endpoint";
  parameters = validateAgentParameters;
  toolType: ToolType = TOOL_TYPE.QUERY;

  constructor(_context: Context = {}) {
    super();
  }

  async normalizeParams(params: ValidateAgentParams): Promise<ValidateAgentParams> {
    return {
      target: params.target.trim(),
    };
  }

  async coreAction(normalisedParams: ValidateAgentParams, _context: Context, _client: Client): Promise<any> {
    const agent = await agentRegistry.getAgent(normalisedParams.target);

    if (!agent) {
      return {
        raw: {
          status: "NOT_FOUND",
          target: normalisedParams.target,
          exists: false,
        },
        humanMessage: `Agent ${normalisedParams.target} was not found in the identity registry.`,
      };
    }

    return {
      raw: {
        status: "SUCCESS",
        target: normalisedParams.target,
        exists: true,
        agent,
      },
      humanMessage: `Agent ${agent.did} (ID: ${agent.agentId}) is verified and active at ${agent.serviceEndpoint}`,
    };
  }

  async shouldSecondaryAction(): Promise<boolean> {
    return false;
  }
}
