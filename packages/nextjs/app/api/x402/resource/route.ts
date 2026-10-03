import { NextRequest, NextResponse } from "next/server";
import {
  buildX402PaymentRequirement,
  getActiveFacilitatorConfig,
  settlePaymentTransaction,
  verifyPaymentTransaction,
} from "../../../../services/facilitator";

const DEFAULT_SELLER_ACCOUNT = "0.0.56789";
const RESOURCE_PRICE_TINYBAR = "100000000"; // 1 HBAR in tinybars

/**
 * Sample x402-gated resource endpoint.
 *
 * Flow:
 * 1. Unpaid request -> Returns HTTP 402 PAYMENT-REQUIRED with payment metadata and active facilitator URL.
 * 2. Paid request (PAYMENT-SIGNATURE header) -> Verifies and settles via facilitator -> Returns HTTP 200 OK with protected resource data.
 */
export async function GET(req: NextRequest) {
  const paymentHeader =
    req.headers.get("payment-signature") ||
    req.headers.get("x-payment") ||
    req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

  const sellerAccount = process.env.AGENT_ACCOUNT_ID || DEFAULT_SELLER_ACCOUNT;
  const { activeUrl, mode } = getActiveFacilitatorConfig();

  // If no payment header provided, return HTTP 402 challenge
  if (!paymentHeader) {
    const requirement = buildX402PaymentRequirement({
      payTo: sellerAccount,
      amountTinybar: RESOURCE_PRICE_TINYBAR,
      memo: "x402-access-agent-insight",
    });

    return NextResponse.json(
      {
        error: "Payment Required",
        message: "This resource requires an x402 micropayment of 1 HBAR (100000000 tinybars).",
        requirement,
        facilitatorMode: mode,
      },
      {
        status: 402,
        headers: {
          "PAYMENT-REQUIRED": JSON.stringify(requirement),
          "WWW-Authenticate": `x402 scheme="exact", network="hedera:testnet", payTo="${sellerAccount}", amount="${RESOURCE_PRICE_TINYBAR}"`,
        },
      },
    );
  }

  // Payment header present: verify and settle
  try {
    let payloadBytes = paymentHeader;
    let paymentDemand = {
      payTo: sellerAccount,
      amount: RESOURCE_PRICE_TINYBAR,
      asset: "0.0.0",
      network: "hedera:testnet",
    };

    // If client supplied JSON in header
    try {
      const parsed = JSON.parse(paymentHeader);
      if (parsed.transactionBytes) {
        payloadBytes = parsed.transactionBytes;
      }
      if (parsed.paymentDemand) {
        paymentDemand = parsed.paymentDemand;
      }
    } catch {
      // paymentHeader is raw base64 transaction string
    }

    const verification = await verifyPaymentTransaction({
      transactionBytes: payloadBytes,
      paymentDemand,
    });

    if (!verification.valid) {
      return NextResponse.json(
        {
          error: "Invalid Payment Signature",
          details: verification.error,
        },
        { status: 402 },
      );
    }

    const settlement = await settlePaymentTransaction({
      transactionBytes: payloadBytes,
      paymentDemand,
    });

    if (!settlement.success) {
      return NextResponse.json(
        {
          error: "Payment Settlement Failed",
          details: settlement.error,
        },
        { status: 402 },
      );
    }

    // Payment settled successfully: deliver protected payload
    const responsePayload = {
      success: true,
      message: "Payment settled successfully via x402 facilitator.",
      settlementReceipt: {
        transactionId: settlement.transactionId,
        consensusTimestamp: settlement.consensusTimestamp,
        feePayer: settlement.feePayer,
        facilitatorMode: mode,
        activeFacilitatorUrl: activeUrl,
      },
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

    return NextResponse.json(responsePayload, {
      status: 200,
      headers: {
        "PAYMENT-RESPONSE": JSON.stringify({
          settled: true,
          transactionId: settlement.transactionId,
        }),
      },
    });
  } catch (error: any) {
    return NextResponse.json(
      {
        error: "Payment processing error",
        message: error?.message || "Failed to process payment challenge",
      },
      { status: 500 },
    );
  }
}

/**
 * Handle POST to same resource endpoint with payment payload in request body
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  if (body.transactionBytes) {
    const signature = JSON.stringify(body);
    const mockHeaders = new Headers(req.headers);
    mockHeaders.set("payment-signature", signature);
    const delegatedReq = new NextRequest(req.url, { headers: mockHeaders, method: "GET" });
    return GET(delegatedReq);
  }
  return GET(req);
}
