import { NextRequest, NextResponse } from "next/server";
import { verifyPaymentTransaction } from "../../../../../services/facilitator";

/**
 * POST /api/x402/facilitator/verify
 * Verifies transaction structure, buyer signature, and exact payment terms.
 * Route Liveness: Handles empty or malformed payloads without unhandled 500 crashes.
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json().catch(() => ({}));
    const result = await verifyPaymentTransaction(body);

    if (!result.valid) {
      return NextResponse.json(
        {
          valid: false,
          error: result.error || "Payment verification failed",
        },
        { status: 400 },
      );
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      {
        valid: false,
        error: error?.message || "Internal server error during payment verification",
      },
      { status: 500 },
    );
  }
}
