import { verifyAuthChallenge } from "../../did";
import { BaseTool, TOOL_TYPE, ToolType } from "@hashgraph/hedera-agent-kit";
import { z } from "zod";

export const VERIFY_AGENT_SIGNATURE_TOOL = "verify_agent_signature_tool";

const verifyAgentSignatureParameters = z.object({
  did: z.string().min(1).describe("The Decentralized Identifier of the signing agent"),
  timestamp: z.number().int().describe("The epoch millisecond timestamp of the signature"),
  signature: z.string().min(1).describe("The cryptographic signature hex string"),
});

type VerifyAgentSignatureParams = z.infer<typeof verifyAgentSignatureParameters>;

export class VerifyAgentSignatureTool extends BaseTool<VerifyAgentSignatureParams, VerifyAgentSignatureParams> {
  method = VERIFY_AGENT_SIGNATURE_TOOL;
  name = "Verify Agent Signature";
  description = "Verifies cryptographic proof and timestamp freshness for an agent authentication challenge";
  parameters = verifyAgentSignatureParameters;
  toolType: ToolType = TOOL_TYPE.QUERY;

  constructor() {
    super();
  }

  async normalizeParams(params: VerifyAgentSignatureParams): Promise<VerifyAgentSignatureParams> {
    return {
      did: params.did.trim(),
      timestamp: params.timestamp,
      signature: params.signature.trim(),
    };
  }

  async coreAction(normalisedParams: VerifyAgentSignatureParams): Promise<any> {
    const result = await verifyAuthChallenge(
      normalisedParams.did,
      normalisedParams.timestamp,
      normalisedParams.signature,
    );

    return {
      raw: {
        status: result.valid ? "SUCCESS" : "INVALID_SIGNATURE",
        valid: result.valid,
        address: result.address,
        error: result.error,
      },
      humanMessage: result.valid
        ? `Cryptographic signature for ${normalisedParams.did} is valid.`
        : `Cryptographic signature verification failed: ${result.error}`,
    };
  }

  async shouldSecondaryAction(): Promise<boolean> {
    return false;
  }
}
