import { submitAuditRecord } from "./audit";
import { SpendGuard, createSpendGuard } from "./spendGuard";
import { SpendAuditRecord } from "./types";

export interface SpendGuardMiddlewareOptions {
  /**
   * Optional custom SpendGuard instance.
   * If omitted, a default instance is created using scaffold.config.yaml and environment variables.
   */
  guard?: SpendGuard;

  /**
   * Optional counterparty allowlist. If specified, incoming payers (from context.payment)
   * must be present in this list. If not specified, falls back to the configured guard allowlist.
   */
  allowlist?: string[];

  /**
   * Maximum acceptable payment amount in HBAR for this route.
   * Rejects payments exceeding this ceiling.
   */
  maxPriceHbar?: number;

  /**
   * Whether to record decisions (ALLOW / BLOCK) to the HCS audit topic and local store.
   * Defaults to true.
   */
  recordAudit?: boolean;
}

export type SpendGuardedHandler = (
  req: Request,
  context: { params?: any; agent?: any; payment?: any; guard?: SpendGuard; [key: string]: any },
) => Promise<Response> | Response;

/**
 * Higher-order Route Handler middleware for Next.js App Router providing policy enforcement,
 * HCS consensus audit logging, and Spend Guard injection for route handlers.
 *
 * Can be composed directly with withAgentTrust and withX402:
 *
 * ```ts
 * export const GET = withAgentTrust(
 *   withX402(
 *     withSpendGuard(async (req, { agent, payment, guard }) => {
 *       // Safe to execute downstream agent payments using guard.executePayment()
 *       return Response.json({ success: true, payer: payment.payer });
 *     }, { maxPriceHbar: 5 })
 *   )
 * );
 * ```
 */
export function withSpendGuard(handler: SpendGuardedHandler, options?: SpendGuardMiddlewareOptions) {
  const guard = options?.guard || createSpendGuard();
  const recordAudit = options?.recordAudit ?? true;

  return async (req: Request, context: any = {}): Promise<Response> => {
    const payment = context?.payment;
    const nowIso = new Date().toISOString();

    // 1. If an incoming payment was processed, enforce server-side spend policies
    if (payment) {
      const payer = payment.payer;
      const amountHbar = payment.amountHbar;
      const amountTinybar = payment.amountTinybar;
      const txId = payment.transactionId;

      // A. Check allowlist if explicitly configured for this route
      if (options?.allowlist && options.allowlist.length > 0) {
        const isAllowed = options.allowlist.some(acc => acc.trim() === payer?.trim());
        if (!isAllowed) {
          const reason = `Payer "${payer}" is not authorized in counterparty allowlist [${options.allowlist.join(", ")}]`;
          const record: SpendAuditRecord = {
            id: `audit_blk_${Date.now()}`,
            timestamp: nowIso,
            action: "route:inboundPayment",
            decision: "BLOCK",
            recipient: guard.config.agentAccountId,
            amountHbar,
            amountTinybar,
            reason,
            enforcement: guard.resolvedMode,
            agentAccountId: guard.config.agentAccountId,
          };

          if (recordAudit) {
            await guard.store.recordDecision(record);
            await submitAuditRecord(guard.client, guard.config.auditTopicId, record);
          }

          return Response.json(
            {
              error: "UnauthorizedPayer",
              message: reason,
            },
            { status: 403 },
          );
        }
      }

      // B. Check max payment price limit
      if (options?.maxPriceHbar !== undefined && amountHbar > options.maxPriceHbar) {
        const reason = `Inbound payment amount (${amountHbar} HBAR) exceeds endpoint ceiling (${options.maxPriceHbar} HBAR)`;
        const record: SpendAuditRecord = {
          id: `audit_blk_${Date.now()}`,
          timestamp: nowIso,
          action: "route:inboundPayment",
          decision: "BLOCK",
          recipient: guard.config.agentAccountId,
          amountHbar,
          amountTinybar,
          reason,
          enforcement: guard.resolvedMode,
          agentAccountId: guard.config.agentAccountId,
        };

        if (recordAudit) {
          await guard.store.recordDecision(record);
          await submitAuditRecord(guard.client, guard.config.auditTopicId, record);
        }

        return Response.json(
          {
            error: "PaymentExceedsCap",
            message: reason,
          },
          { status: 400 },
        );
      }

      // C. Submit ALLOW audit record to HCS topic for immutable receipt
      if (recordAudit) {
        const record: SpendAuditRecord = {
          id: `audit_alw_${Date.now()}`,
          timestamp: nowIso,
          action: "route:inboundPayment",
          decision: "ALLOW",
          recipient: guard.config.agentAccountId,
          amountHbar,
          amountTinybar,
          txId,
          reason: "Payment verified against route policy and settlement criteria",
          enforcement: guard.resolvedMode,
          agentAccountId: guard.config.agentAccountId,
        };

        await guard.store.recordDecision(record);
        await submitAuditRecord(guard.client, guard.config.auditTopicId, record);
      }
    }

    // 2. Inject spend guard instance into context for downstream spending or tool execution
    const enrichedContext = {
      ...context,
      guard,
    };

    return handler(req, enrichedContext);
  };
}
