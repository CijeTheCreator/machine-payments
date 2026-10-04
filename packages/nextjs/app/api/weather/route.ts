import { NextResponse } from "next/server";
import { withX402 } from "~~/services/facilitator";
import { withSpendGuard } from "~~/services/guard";

// 1 HBAR = 100000000 tinybars
const PRICE_TINYBAR = "100000000";

// Payment destination: Routes to Vault if deployed, else seller account
const PAY_TO =
  process.env.NEXT_PUBLIC_VAULT_ADDRESS || process.env.VAULT_CONTRACT_ID || process.env.AGENT_ACCOUNT_ID || "0.0.X";

/**
 * x402 protected resource handler: weather
 */
const weatherHandler = async (req: Request, { payment, guard }: any) => {
  // =========================================================================
  // TODO: Implement the service or data you are selling here!
  //
  // This code only executes AFTER the client successfully completes the
  // x402 micropayment challenge and passes spend guard / trust policies.
  //
  // Ideas:
  // - Run an AI model inference or compute job
  // - Fetch private database records or real-time data feeds
  // - Call a premium upstream API or microservice
  // =========================================================================

  const servicePayload = {
    service: "weather",
    city: "Hedera Consensus Cloud",
    temperature: "22°C",
    condition: "Fair & Decentralized",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({
    success: true,
    message: "Resource unlocked successfully via x402 payment.",
    settlementReceipt: payment?.settlement,
    guardPolicy: guard?.policyDecision,
    data: servicePayload,
  });
};

export const GET = withX402(
  withSpendGuard(weatherHandler, {
    maxPriceHbar: 10,
    recordAudit: true,
  }),
  {
    priceTinybar: PRICE_TINYBAR,
    payTo: PAY_TO,
    memo: "x402-weather",
  },
);

export const POST = GET;
