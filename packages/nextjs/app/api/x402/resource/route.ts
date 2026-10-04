import { NextResponse } from "next/server";
import { withX402 } from "../../../../services/facilitator";
import { withSpendGuard } from "../../../../services/guard";

const DEFAULT_SELLER_ACCOUNT = "0.0.56789";
const RESOURCE_PRICE_TINYBAR = "100000000"; // 1 HBAR in tinybars

/**
 * Sample x402-gated resource endpoint protected by composable middlewares.
 *
 * Middleware pipeline:
 * withX402: Handles HTTP 402 challenge negotiation, signature verification & facilitator settlement.
 * withSpendGuard: Enforces server-side guard policies, emits HCS audit receipt, and injects context.guard.
 */
const resourceHandler = async (_req: Request, { payment }: any) => {
  const responsePayload = {
    success: true,
    message: "Payment settled successfully via x402 facilitator.",
    settlementReceipt: payment?.settlement,
    data: {
      resourceId: "agent-alpha-stream",
      title: "Exclusive Autonomous Agent Market Intelligence",
      computedAt: new Date().toISOString(),
      payload: {
        recommendedAction: "REBALANCE_HBAR_LIQUIDITY",
        confidenceScore: 0.984,
        networkState: "OPTIMAL",
      },
    },
  };

  return NextResponse.json(responsePayload);
};

export const GET = withX402(
  withSpendGuard(resourceHandler, {
    maxPriceHbar: 10,
    recordAudit: true,
  }),
  {
    priceTinybar: RESOURCE_PRICE_TINYBAR,
    payTo: process.env.AGENT_ACCOUNT_ID || DEFAULT_SELLER_ACCOUNT,
    memo: "x402-access-agent-insight",
  },
);

export const POST = GET;
