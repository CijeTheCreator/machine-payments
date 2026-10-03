import { NextRequest, NextResponse } from "next/server";
import { settlePaymentTransaction } from "../../../../../services/facilitator";

/**
 * POST /api/x402/facilitator/settle
 * Co-signs transaction as fee payer and settles to Hedera testnet consensus.
 * Route Liveness: Gracefully returns error responses rather than unhandled 500 exceptions.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await settlePaymentTransaction(body);

    if (!result.success) {
      return NextResponse.json(
        {
          success: false,
          error: result.error || "Payment settlement failed",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        success: false,
        error: error?.message || "Internal server error during payment settlement",
      },
      { status: 500 },
    );
  }
}
