import { PolicySnapshot } from "./policyRegistry";
import { SpendAuditRecord } from "./types";

export interface TransactionCredit {
  account: string;
  amountHbar: number;
  amountTinybar: string;
}

export interface TransactionVerificationResult {
  state: "ok" | "fail";
  txId: string;
  payer?: string;
  status?: string;
  consensusTimestamp?: string;
  credits: TransactionCredit[];
  compliantWithPolicy?: boolean;
  violations: string[];
  error?: string;
}

export interface SpendReconciliation {
  kvSpentHbar: number;
  hcsSpentHbar: number;
  match: boolean;
  auditTopicId?: string;
  policyTopicId?: string;
  agentAccountId?: string;
  auditRecordCount: number;
}

const SYSTEM_ACCOUNTS = new Set([
  "0.0.98", // Fee distribution
  "0.0.800", // Staking reward
  "0.0.801", // Node reward
]);

function isSystemAccount(acc: string): boolean {
  if (SYSTEM_ACCOUNTS.has(acc)) return true;
  // Accounts 0.0.3 to 0.0.34 are consensus nodes
  return /^0\.0\.(?:[3-9]|[12]\d|3[0-4])$/.test(acc);
}

/**
 * Normalizes a Hedera transaction ID into Mirror Node query format:
 * "0.0.123@1710000000.000000000" -> "0.0.123-1710000000-000000000"
 */
export function toMirrorTransactionId(txId: string): string {
  return txId
    .trim()
    .replace("@", "-")
    .replace(/\.(\d+)$/, "-$1");
}

/**
 * Reads decoded SpendAuditRecord logs from the HCS audit topic in reverse chronological order.
 */
export async function readAuditRecords(
  mirrorBaseUrl: string,
  topicId: string | undefined,
  opts?: { max?: number; untilTs?: number },
): Promise<SpendAuditRecord[]> {
  if (!topicId || topicId === "0.0.X") {
    return [];
  }

  const cleanHost = mirrorBaseUrl.replace(/\/api\/v1\/?$/, "");
  const max = opts?.max ?? 200;
  let path: string | null = `/api/v1/topics/${topicId}/messages?order=desc&limit=100`;
  const records: SpendAuditRecord[] = [];

  try {
    while (path && records.length < max) {
      const res = await fetch(cleanHost + path, { cache: "no-store" });
      if (!res.ok) break;

      const json: any = await res.json();
      const messages = json.messages || [];

      for (const m of messages) {
        try {
          const raw = Buffer.from(m.message, "base64").toString("utf-8");
          const parsed = JSON.parse(raw);
          if (parsed && parsed.action && parsed.decision) {
            records.push(parsed as SpendAuditRecord);
          }
        } catch {
          // Skip non-audit records
        }
      }

      if (opts?.untilTs && records.length) {
        const last = records[records.length - 1];
        const lastTime = new Date(last.timestamp).getTime();
        if (lastTime < opts.untilTs) break;
      }

      path = json.links?.next
        ? new URL(json.links.next, cleanHost).pathname + new URL(json.links.next, cleanHost).search
        : null;
    }
  } catch (err: any) {
    console.warn(`[Verification] Error reading audit topic ${topicId}: ${err?.message}`);
  }

  return records;
}

/**
 * Recomputes the rolling-24h spend directly from the public HCS audit log.
 * Independent recalculation guarantees transparency and detects any local store divergence.
 */
export async function spentTodayFromHcs(
  cfg: { auditTopicId?: string; agentAccountId?: string },
  mirrorBaseUrl: string,
  windowMs = 24 * 60 * 60 * 1000,
): Promise<number> {
  if (!cfg.auditTopicId || cfg.auditTopicId === "0.0.X") {
    return 0;
  }

  const since = Date.now() - windowMs;
  const records = await readAuditRecords(mirrorBaseUrl, cfg.auditTopicId, { untilTs: since });

  const relevant = records.filter(r => {
    const recordTime = new Date(r.timestamp).getTime();
    const isAllowed = r.decision === "ALLOW";
    const matchesAgent = !cfg.agentAccountId || r.agentAccountId === cfg.agentAccountId;
    return isAllowed && matchesAgent && recordTime >= since;
  });

  const sumHbar = relevant.reduce((acc, r) => acc + (r.amountHbar || 0), 0);
  return Number(sumHbar.toFixed(4));
}

/**
 * Queries the public Hedera Mirror Node to verify an on-chain transaction receipt
 * and validate whether it complied with active spend policy rules.
 */
export async function verifyTransactionOnLedger(
  mirrorBaseUrl: string,
  txId: string,
  activePolicy?: PolicySnapshot,
): Promise<TransactionVerificationResult> {
  const cleanId = txId.trim();
  if (!cleanId) {
    return {
      state: "fail",
      txId: cleanId,
      credits: [],
      violations: [],
      error: "Transaction ID is required",
    };
  }

  const cleanHost = mirrorBaseUrl.replace(/\/api\/v1\/?$/, "");
  const mirrorTxId = toMirrorTransactionId(cleanId);
  const url = `${cleanHost}/api/v1/transactions/${mirrorTxId}`;

  try {
    const res = await fetch(url, { cache: "no-store" });
    if (!res.ok) {
      if (res.status === 404) {
        return {
          state: "fail",
          txId: cleanId,
          credits: [],
          violations: ["Transaction not found on Hedera network."],
          error: "Transaction not found on Mirror Node",
        };
      }
      return {
        state: "fail",
        txId: cleanId,
        credits: [],
        violations: [`Mirror Node returned status ${res.status}`],
        error: `Mirror Node error: ${res.statusText}`,
      };
    }

    const data: any = await res.json();
    const transactions = data.transactions || [];
    if (!transactions.length) {
      return {
        state: "fail",
        txId: cleanId,
        credits: [],
        violations: ["No transaction records returned for this ID."],
        error: "Transaction record empty",
      };
    }

    const credits: TransactionCredit[] = [];
    let status = "UNKNOWN";
    let consensusTimestamp = "";

    for (const tx of transactions) {
      status = tx.result || status;
      if (!consensusTimestamp && tx.consensus_timestamp) {
        consensusTimestamp = tx.consensus_timestamp;
      }

      for (const tr of tx.transfers || []) {
        if (tr.amount > 0 && !isSystemAccount(tr.account)) {
          credits.push({
            account: tr.account,
            amountHbar: Number((tr.amount / 1e8).toFixed(4)),
            amountTinybar: tr.amount.toString(),
          });
        }
      }
    }

    const payer = cleanId.includes("@") ? cleanId.split("@")[0] : cleanId.split("-").slice(0, 3).join(".");

    // Validate against active policy rules if provided
    const violations: string[] = [];
    let compliantWithPolicy = true;

    if (status !== "SUCCESS") {
      compliantWithPolicy = false;
      violations.push(`Transaction did not succeed in consensus (status: ${status})`);
    }

    if (activePolicy) {
      for (const credit of credits) {
        // Allowlist check
        if (activePolicy.allowlist && activePolicy.allowlist.length > 0) {
          const isAllowed = activePolicy.allowlist.includes(credit.account);
          if (!isAllowed) {
            compliantWithPolicy = false;
            violations.push(`Recipient ${credit.account} is not on the active allowlist`);
          }
        }

        // Cap check
        if (activePolicy.perTaskHbar && credit.amountHbar > activePolicy.perTaskHbar) {
          compliantWithPolicy = false;
          violations.push(
            `Transfer of ${credit.amountHbar} HBAR exceeds active per-task cap of ${activePolicy.perTaskHbar} HBAR`,
          );
        }
      }
    }

    return {
      state: "ok",
      txId: cleanId,
      payer,
      status,
      consensusTimestamp,
      credits,
      compliantWithPolicy,
      violations,
    };
  } catch (err: any) {
    return {
      state: "fail",
      txId: cleanId,
      credits: [],
      violations: [`Network error querying Mirror Node: ${err?.message}`],
      error: err?.message || "Failed to reach Mirror Node",
    };
  }
}
