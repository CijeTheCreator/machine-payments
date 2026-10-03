import { NextResponse } from "next/server";
import { getSupportedCapabilities } from "../../../../../services/facilitator";

/**
 * GET /api/x402/facilitator/supported
 * Capability discovery endpoint advertising supported networks (hedera:testnet),
 * schemes (exact), and fee-payer account.
 * Route Liveness: Always returns HTTP 200 OK.
 */
export async function GET() {
  const capabilities = getSupportedCapabilities();
  return NextResponse.json(capabilities, { status: 200 });
}
