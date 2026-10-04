import {
  buildX402PaymentRequirement,
  getActiveFacilitatorConfig,
  settlePaymentTransaction,
  verifyPaymentTransaction,
} from "./facilitatorService";
import { PaymentDemand } from "./types";

export interface X402PaymentInfo {
  payer: string;
  transactionId: string;
  amountTinybar: string;
  amountHbar: number;
  settlement: {
    transactionId?: string;
    consensusTimestamp?: string;
    feePayer?: string;
    facilitatorMode?: string;
    activeFacilitatorUrl?: string;
  };
}

export interface X402MiddlewareOptions {
  priceHbar?: number;
  priceTinybar?: bigint | string | number;
  payTo?: string;
  asset?: string;
  network?: string;
  memo?: string;
}

export type X402Handler = (
  req: Request,
  context: { params?: any; agent?: any; payment?: X402PaymentInfo; [key: string]: any },
) => Promise<Response> | Response;

/**
 * Higher-order Route Handler middleware for Next.js App Router providing x402 payment protection.
 *
 * Flow:
 * 1. Checks incoming headers / body for payment signatures (x402 scheme).
 * 2. If unpaid, returns standard HTTP 402 PAYMENT-REQUIRED challenge with x402 headers.
 * 3. If paid, validates and settles payment with the active facilitator (hosted or self-hosted).
 * 4. Injects verified payment details into context.payment and sets PAYMENT-RESPONSE header on response.
 */
export function withX402(handler: X402Handler, options?: X402MiddlewareOptions) {
  return async (req: Request, context: any = {}): Promise<Response> => {
    // Resolve payment demand parameters
    let requiredAmountTinybar: string;
    if (options?.priceTinybar !== undefined) {
      requiredAmountTinybar = options.priceTinybar.toString();
    } else if (options?.priceHbar !== undefined) {
      requiredAmountTinybar = BigInt(Math.round(options.priceHbar * 1e8)).toString();
    } else {
      // Default: 1 HBAR (100,000,000 tinybars)
      requiredAmountTinybar = "100000000";
    }

    const payTo = options?.payTo || process.env.AGENT_ACCOUNT_ID || "0.0.56789";
    const asset = options?.asset || "0.0.0";
    const network = options?.network || "hedera:testnet";
    const memo = options?.memo || "x402-resource-access";

    const { activeUrl, mode } = getActiveFacilitatorConfig();

    // 1. Extract payment signature header or token
    let paymentHeader =
      req.headers.get("payment-signature") ||
      req.headers.get("x-payment") ||
      req.headers.get("authorization")?.replace(/^Bearer\s+/i, "");

    // If method is POST/PUT and no header was provided, check json body for transactionBytes
    if (!paymentHeader && ["POST", "PUT", "PATCH"].includes(req.method.toUpperCase())) {
      try {
        const clonedReq = req.clone();
        const body = await clonedReq.json().catch(() => ({}));
        if (body?.transactionBytes) {
          paymentHeader = JSON.stringify(body);
        }
      } catch {
        // Non-JSON body or stream clone failure
      }
    }

    // 2. Unpaid request -> Return standard HTTP 402 challenge
    if (!paymentHeader) {
      const requirement = buildX402PaymentRequirement({
        payTo,
        amountTinybar: requiredAmountTinybar,
        memo,
      });

      return Response.json(
        {
          error: "Payment Required",
          message: `This resource requires an x402 micropayment of ${requiredAmountTinybar} tinybars (${Number(requiredAmountTinybar) / 1e8} HBAR).`,
          requirement,
          facilitatorMode: mode,
        },
        {
          status: 402,
          headers: {
            "PAYMENT-REQUIRED": JSON.stringify(requirement),
            "WWW-Authenticate": `x402 scheme="exact", network="${network}", payTo="${payTo}", amount="${requiredAmountTinybar}"`,
          },
        },
      );
    }

    // 3. Paid request -> Verify & Settle
    try {
      let payloadBytes = paymentHeader;
      let paymentDemand: PaymentDemand = {
        payTo,
        amount: requiredAmountTinybar,
        asset,
        network,
      };

      // Check if client provided JSON wrapper in header/body
      try {
        const parsed = JSON.parse(paymentHeader);
        if (parsed.transactionBytes) {
          payloadBytes = parsed.transactionBytes;
        }
        if (parsed.paymentDemand) {
          paymentDemand = {
            ...paymentDemand,
            ...parsed.paymentDemand,
          };
        }
      } catch {
        // paymentHeader is raw base64 transaction string
      }

      // Verify transaction bytes against demanded price & seller
      const verification = await verifyPaymentTransaction({
        transactionBytes: payloadBytes,
        paymentDemand,
      });

      if (!verification.valid) {
        return Response.json(
          {
            error: "Invalid Payment Signature",
            details: verification.error,
          },
          { status: 402 },
        );
      }

      // Settle transaction on Hedera
      const settlement = await settlePaymentTransaction({
        transactionBytes: payloadBytes,
        paymentDemand,
      });

      if (!settlement.success) {
        return Response.json(
          {
            error: "Payment Settlement Failed",
            details: settlement.error,
          },
          { status: 402 },
        );
      }

      // Construct verified payment details
      const paymentInfo: X402PaymentInfo = {
        payer: verification.payerAccountId || "unknown",
        transactionId: settlement.transactionId || "",
        amountTinybar: requiredAmountTinybar,
        amountHbar: Number(requiredAmountTinybar) / 1e8,
        settlement: {
          transactionId: settlement.transactionId,
          consensusTimestamp: settlement.consensusTimestamp,
          feePayer: settlement.feePayer,
          facilitatorMode: mode,
          activeFacilitatorUrl: activeUrl,
        },
      };

      const enrichedContext = {
        ...context,
        payment: paymentInfo,
      };

      // Invoke inner handler
      const response = await handler(req, enrichedContext);

      // Inject standard PAYMENT-RESPONSE header into outgoing response
      const updatedHeaders = new Headers(response.headers);
      updatedHeaders.set(
        "PAYMENT-RESPONSE",
        JSON.stringify({
          settled: true,
          transactionId: settlement.transactionId,
        }),
      );

      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers: updatedHeaders,
      });
    } catch (err: any) {
      return Response.json(
        {
          error: "Payment processing error",
          message: err?.message || "Failed to process payment challenge",
        },
        { status: 500 },
      );
    }
  };
}
