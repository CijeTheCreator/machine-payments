import { verifyAuthChallenge } from "./did";
import { agentRegistry } from "./registry";
import { AgentIdentity, AgentTrustMiddlewareOptions } from "./types";

export type AuthenticatedAgentHandler = (
  req: Request,
  context: { params?: any; agent?: AgentIdentity },
) => Promise<Response> | Response;

/**
 * Higher-order Route Handler middleware for Next.js App Router.
 * Verifies incoming agent identity proofs (DID, signature, timestamp) against
 * the Agent Registry before allowing access.
 *
 * Can be composed directly with x402 payment protection:
 *
 * ```ts
 * export const POST = withAgentTrust(
 *   withX402(async (req, { agent }) => {
 *     return Response.json({ message: "Success", caller: agent.did });
 *   })
 * );
 * ```
 */
export function withAgentTrust(handler: AuthenticatedAgentHandler, options?: AgentTrustMiddlewareOptions) {
  const requireRegistered = options?.requireRegistered ?? true;
  const maxDriftMs = options?.maxTimestampDriftMs ?? 300_000; // 5 minutes

  return async (req: Request, context: any = {}): Promise<Response> => {
    const did = req.headers.get("x-agent-did");
    const signature = req.headers.get("x-agent-signature");
    const timestampHeader = req.headers.get("x-agent-timestamp");

    if (!did || !signature || !timestampHeader) {
      return Response.json(
        {
          error: "UnauthorizedAgent",
          message: "Missing required agent authentication headers: x-agent-did, x-agent-signature, x-agent-timestamp",
        },
        { status: 401 },
      );
    }

    const timestamp = parseInt(timestampHeader, 10);
    if (isNaN(timestamp)) {
      return Response.json(
        {
          error: "InvalidTimestamp",
          message: "Header x-agent-timestamp must be a valid epoch millisecond integer",
        },
        { status: 400 },
      );
    }

    // 1. Verify cryptographic challenge signature
    const verification = await verifyAuthChallenge(did, timestamp, signature, maxDriftMs);
    if (!verification.valid || !verification.address) {
      return Response.json(
        {
          error: "InvalidSignature",
          message: verification.error || "Cryptographic proof validation failed",
        },
        { status: 401 },
      );
    }

    // 2. Verify registry presence if required
    let agent: AgentIdentity | undefined;
    if (requireRegistered) {
      const registeredAgent = await agentRegistry.getAgent(verification.address);
      if (!registeredAgent) {
        return Response.json(
          {
            error: "UnregisteredAgent",
            message: `Agent ${did} (${verification.address}) is not registered in the on-chain identity registry`,
          },
          { status: 403 },
        );
      }
      agent = registeredAgent;
    }

    // Attach verified agent to context
    const enrichedContext = {
      ...context,
      agent,
    };

    return handler(req, enrichedContext);
  };
}
