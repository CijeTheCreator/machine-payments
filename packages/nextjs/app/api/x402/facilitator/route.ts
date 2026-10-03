import { NextResponse } from "next/server";
import { getActiveFacilitatorConfig } from "../../../../services/facilitator";

/**
 * Health check & status endpoint for x402 facilitator.
 * Route Liveness: Returns HTTP 200 OK cleanly even if operator credentials are not yet provisioned.
 */
export async function GET() {
  const config = getActiveFacilitatorConfig();

  return NextResponse.json(
    {
      status: "ok",
      facilitator: "Scaffold-HBAR Self-Hosted x402 Facilitator",
      network: "hedera:testnet",
      mode: config.mode,
      activeUrl: config.activeUrl,
      advertisedFeePayer: config.feePayer,
      timestamp: new Date().toISOString(),
    },
    { status: 200 },
  );
}
