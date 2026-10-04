import { agentRegistry } from "../../registry";
import { BaseTool } from "@hashgraph/hedera-agent-kit";
import { z } from "zod";

export const REGISTER_AGENT_TOOL = "register_agent_tool";

const registerAgentParameters = z.object({
  did: z.string().min(1).describe("The Decentralized Identifier for the agent (e.g. did:hedera:testnet:0x...)"),
  description: z.string().min(1).describe("Human-readable role or description of the agent"),
  serviceEndpoint: z.string().url().describe("HTTP URL where the agent listens for machine requests"),
  walletAddress: z
    .string()
    .regex(/^0x[a-fA-F0-9]{40}$/)
    .optional()
    .describe("EVM wallet address of the agent"),
});

type RegisterAgentParams = z.infer<typeof registerAgentParameters>;

export class RegisterAgentTool extends BaseTool<RegisterAgentParams, RegisterAgentParams> {
  method = REGISTER_AGENT_TOOL;
  name = "Register Agent Identity";
  description = "Registers an agent's DID, description, and service endpoint in the on-chain Identity Registry";
  parameters = registerAgentParameters;

  constructor() {
    super();
  }

  async normalizeParams(params: RegisterAgentParams): Promise<RegisterAgentParams> {
    return {
      ...params,
      did: params.did.trim(),
      description: params.description.trim(),
      serviceEndpoint: params.serviceEndpoint.trim(),
      walletAddress: params.walletAddress?.toLowerCase(),
    };
  }

  async coreAction(normalisedParams: RegisterAgentParams): Promise<any> {
    const identity = await agentRegistry.registerAgent(normalisedParams);

    return {
      raw: {
        status: "SUCCESS",
        agent: identity,
      },
      humanMessage: `Successfully registered agent ${identity.did} (ID: ${identity.agentId}) at ${identity.serviceEndpoint}`,
    };
  }

  async shouldSecondaryAction(): Promise<boolean> {
    return false;
  }
}
