"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  ListBulletIcon,
  MagnifyingGlassIcon,
  ShieldCheckIcon,
  XCircleIcon,
} from "@heroicons/react/24/outline";

interface VerificationData {
  kvSpentHbar: number;
  hcsSpentHbar: number;
  match: boolean;
  auditTopicId: string | null;
  policyTopicId: string | null;
  agentAccountId: string;
  mirrorNode: string;
  activePolicy: any;
  policyHistory: any[];
  recentAudits: any[];
  isOfflineFallback: boolean;
}

interface TxVerificationState {
  state: "idle" | "loading" | "ok" | "fail";
  txId?: string;
  payer?: string;
  status?: string;
  consensusTimestamp?: string;
  credits?: Array<{ account: string; amountHbar: number }>;
  compliantWithPolicy?: boolean;
  violations?: string[];
  error?: string;
}

export default function VerifyPage() {
  const [data, setData] = useState<VerificationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [txInput, setTxInput] = useState("");
  const [txResult, setTxResult] = useState<TxVerificationState>({ state: "idle" });

  const fetchData = useCallback(async (showRefreshing = false) => {
    if (showRefreshing) setRefreshing(true);
    try {
      const res = await fetch("/api/verify");
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error("Failed to fetch verify data:", err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const interval = setInterval(() => {
      fetchData();
    }, 10000);
    return () => clearInterval(interval);
  }, [fetchData]);

  const verifyTransaction = async (txIdToVerify: string) => {
    const cleanId = txIdToVerify.trim();
    if (!cleanId) return;

    setTxInput(cleanId);
    setTxResult({ state: "loading" });

    try {
      // Normalize transaction ID for Mirror Node query:
      // "0.0.123@1710000000.000000000" -> "0.0.123-1710000000-000000000"
      const mirrorTxId = cleanId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
      const mirrorBase = data?.mirrorNode || "https://testnet.mirrornode.hedera.com";
      const cleanHost = mirrorBase.replace(/\/api\/v1\/?$/, "");

      const res = await fetch(`${cleanHost}/api/v1/transactions/${mirrorTxId}`);
      if (!res.ok) {
        if (res.status === 404) {
          setTxResult({
            state: "fail",
            txId: cleanId,
            error: "Transaction not found on Hedera network.",
          });
          return;
        }
        setTxResult({
          state: "fail",
          txId: cleanId,
          error: `Mirror Node returned HTTP ${res.status}: ${res.statusText}`,
        });
        return;
      }

      const json = await res.json();
      const records = json.transactions || [];
      if (!records.length) {
        setTxResult({
          state: "fail",
          txId: cleanId,
          error: "No transaction records found for this ID.",
        });
        return;
      }

      const credits: Array<{ account: string; amountHbar: number }> = [];
      let status = "UNKNOWN";
      let when = "";

      for (const t of records) {
        status = t.result || status;
        if (!when && t.consensus_timestamp) when = t.consensus_timestamp;

        for (const tr of t.transfers || []) {
          // Exclude system/node accounts
          const isSystem =
            tr.account === "0.0.98" ||
            tr.account === "0.0.800" ||
            tr.account === "0.0.801" ||
            /^0\.0\.(?:[3-9]|[12]\d|3[0-4])$/.test(tr.account);

          if (tr.amount > 0 && !isSystem) {
            credits.push({
              account: tr.account,
              amountHbar: Number((tr.amount / 1e8).toFixed(4)),
            });
          }
        }
      }

      const payer = cleanId.includes("@") ? cleanId.split("@")[0] : cleanId.split("-").slice(0, 3).join(".");

      // Evaluate against active policy
      const violations: string[] = [];
      let compliantWithPolicy = true;

      if (status !== "SUCCESS") {
        compliantWithPolicy = false;
        violations.push(`Transaction failed in consensus with status: ${status}`);
      }

      if (data?.activePolicy) {
        const policy = data.activePolicy;
        for (const c of credits) {
          if (policy.allowlist && policy.allowlist.length > 0 && !policy.allowlist.includes(c.account)) {
            compliantWithPolicy = false;
            violations.push(`Recipient ${c.account} is not on the active allowlist`);
          }
          if (policy.perTaskHbar && c.amountHbar > policy.perTaskHbar) {
            compliantWithPolicy = false;
            violations.push(`Amount (${c.amountHbar} ℏ) exceeds active per-task cap (${policy.perTaskHbar} ℏ)`);
          }
        }
      }

      setTxResult({
        state: "ok",
        txId: cleanId,
        payer,
        status,
        consensusTimestamp: when,
        credits,
        compliantWithPolicy,
        violations,
      });
    } catch (err: any) {
      setTxResult({
        state: "fail",
        txId: cleanId,
        error: `Network error querying Hedera Mirror Node: ${err?.message}`,
      });
    }
  };

  const topicHashScanUrl = (topicId: string | null) => (topicId ? `https://hashscan.io/testnet/topic/${topicId}` : "#");

  const txHashScanUrl = (txId: string) => {
    const formatted = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
    return `https://hashscan.io/testnet/transaction/${formatted}`;
  };

  return (
    <div className="flex flex-col flex-grow pt-8 px-4 sm:px-8 max-w-6xl mx-auto w-full mb-12">
      {/* Page Title & Controls */}
      <div className="flex flex-col md:flex-row md:items-center justify-between pb-6 border-b border-base-300 gap-4">
        <div>
          <div className="flex items-center gap-2">
            <span className="badge badge-primary gap-1 font-mono text-xs uppercase px-3 py-2">
              <ShieldCheckIcon className="w-4 h-4" /> Consensus Auditing
            </span>
            {data?.isOfflineFallback && (
              <span className="badge badge-warning text-xs font-mono">Offline / Local Mode</span>
            )}
          </div>
          <h1 className="text-3xl font-extrabold tracking-tight mt-2 text-base-content">
            Ledger Verification & Policy Registry
          </h1>
          <p className="text-sm text-base-content/70 mt-1 max-w-2xl">
            Reconcile agent spending memory against immutable HCS consensus messages, inspect HCS-2 policy version
            history, and cryptographically verify payment receipts.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => fetchData(true)}
            disabled={refreshing || loading}
            className="btn btn-sm btn-outline gap-1.5"
            title="Refresh consensus state"
          >
            <ArrowPathIcon className={`w-4 h-4 ${refreshing || loading ? "animate-spin" : ""}`} />
            {loading ? "Loading..." : "Refresh"}
          </button>
        </div>
      </div>

      {/* Topics & Network Metadata Banner */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
        <div className="bg-base-200/60 p-4 rounded-xl border border-base-300 flex flex-col justify-between">
          <span className="text-xs uppercase tracking-wider text-base-content/60 font-semibold">HCS Audit Topic</span>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-sm font-bold">{data?.auditTopicId || "Unset (Local Dev)"}</span>
            {data?.auditTopicId && (
              <a
                href={topicHashScanUrl(data.auditTopicId)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-xs text-primary gap-1"
              >
                HashScan <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <span className="text-[11px] text-base-content/50 mt-1">Memo: agent-spend-audit (immutable decisions)</span>
        </div>

        <div className="bg-base-200/60 p-4 rounded-xl border border-base-300 flex flex-col justify-between">
          <span className="text-xs uppercase tracking-wider text-base-content/60 font-semibold">
            HCS-2 Policy Registry
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-sm font-bold">{data?.policyTopicId || "Unset (Local Dev)"}</span>
            {data?.policyTopicId && (
              <a
                href={topicHashScanUrl(data.policyTopicId)}
                target="_blank"
                rel="noreferrer"
                className="btn btn-ghost btn-xs text-primary gap-1"
              >
                HashScan <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
              </a>
            )}
          </div>
          <span className="text-[11px] text-base-content/50 mt-1">Memo: hcs-2:0:86400 (owner-only submit key)</span>
        </div>

        <div className="bg-base-200/60 p-4 rounded-xl border border-base-300 flex flex-col justify-between">
          <span className="text-xs uppercase tracking-wider text-base-content/60 font-semibold">
            Governed Agent Account
          </span>
          <div className="mt-2 flex items-center justify-between">
            <span className="font-mono text-sm font-bold text-primary">{data?.agentAccountId || "0.0.X"}</span>
            <span className="badge badge-sm badge-outline font-mono">{data?.activePolicy?.mode || "auto"}</span>
          </div>
          <span className="text-[11px] text-base-content/50 mt-1">
            Enforcement: Multi-tier ladder (L0/L1 + L2 Vault)
          </span>
        </div>
      </div>

      {/* Reconciliation Meter */}
      <div className="mt-6 bg-base-100 p-6 rounded-2xl border border-base-300 shadow-sm">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            {data?.match ? (
              <div className="w-10 h-10 rounded-full bg-success/10 text-success flex items-center justify-center shrink-0">
                <CheckCircleIcon className="w-6 h-6" />
              </div>
            ) : (
              <div className="w-10 h-10 rounded-full bg-error/10 text-error flex items-center justify-center shrink-0">
                <ExclamationTriangleIcon className="w-6 h-6" />
              </div>
            )}
            <div>
              <h2 className="text-lg font-bold">
                {data?.match ? "Consensus Reconciliation: Matches Exactly" : "State Divergence Detected"}
              </h2>
              <p className="text-xs text-base-content/70">
                Independent recalculation of 24h rolling spend from public Mirror Node consensus messages.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-6">
            <div className="text-right">
              <span className="text-[11px] uppercase tracking-wider text-base-content/60 font-semibold block">
                Local Store Spend
              </span>
              <span className="font-mono text-xl font-extrabold text-base-content">
                {data ? `${data.kvSpentHbar} ℏ` : "..."}
              </span>
            </div>
            <div className="text-right border-l border-base-300 pl-6">
              <span className="text-[11px] uppercase tracking-wider text-base-content/60 font-semibold block">
                HCS Consensus Spend
              </span>
              <span className="font-mono text-xl font-extrabold text-primary">
                {data ? `${data.hcsSpentHbar} ℏ` : "..."}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Transaction Verifier */}
      <div className="mt-8 bg-base-100 p-6 rounded-2xl border border-base-300 shadow-sm">
        <div className="flex items-center gap-2 mb-2">
          <DocumentCheckIcon className="w-5 h-5 text-primary" />
          <h2 className="text-xl font-bold">Cryptographic Transaction Receipt Verifier</h2>
        </div>
        <p className="text-xs text-base-content/70 mb-4">
          Paste any Hedera transaction ID to inspect its execution on the Mirror Node and verify adherence to the active
          spend policy.
        </p>

        <div className="flex flex-col sm:flex-row gap-2">
          <input
            type="text"
            value={txInput}
            onChange={e => setTxInput(e.target.value)}
            onKeyDown={e => e.key === "Enter" && verifyTransaction(txInput)}
            placeholder="e.g. 0.0.12345@1710000000.000000000 or 0.0.12345-1710000000-000000000"
            className="input input-bordered flex-1 font-mono text-xs"
          />
          <button
            onClick={() => verifyTransaction(txInput)}
            disabled={!txInput.trim() || txResult.state === "loading"}
            className="btn btn-primary btn-sm sm:btn-md gap-1"
          >
            <MagnifyingGlassIcon className="w-4 h-4" />
            Verify on Hedera
          </button>
        </div>

        {/* Quick Picks from Recent Audits */}
        {data?.recentAudits && data.recentAudits.filter(a => a.txId).length > 0 && (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs text-base-content/60">
            <span className="font-medium mr-1">Recent payments:</span>
            {data.recentAudits
              .filter(a => a.txId)
              .slice(0, 4)
              .map((a, idx) => (
                <button
                  key={idx}
                  onClick={() => verifyTransaction(a.txId)}
                  className="badge badge-outline hover:badge-primary font-mono text-[11px] cursor-pointer"
                >
                  {a.amountHbar} ℏ → {a.recipient}
                </button>
              ))}
          </div>
        )}

        {/* Verification Result Display */}
        {txResult.state !== "idle" && (
          <div className="mt-5 border border-base-300 rounded-xl overflow-hidden bg-base-200/40">
            {txResult.state === "loading" && (
              <div className="p-6 flex items-center justify-center gap-2 text-sm text-base-content/70">
                <span className="loading loading-spinner loading-sm text-primary"></span>
                Querying Hedera Mirror Node consensus records...
              </div>
            )}

            {txResult.state === "fail" && (
              <div className="p-5 bg-error/10 border-l-4 border-error text-error text-xs font-mono">
                ✗ {txResult.error}
              </div>
            )}

            {txResult.state === "ok" && (
              <div>
                <div className="flex flex-col sm:flex-row sm:items-center justify-between p-4 border-b border-base-300 bg-base-200/60 gap-2">
                  <div className="flex items-center gap-2">
                    <span
                      className={`badge font-mono text-xs ${
                        txResult.status === "SUCCESS" ? "badge-success" : "badge-warning"
                      }`}
                    >
                      {txResult.status}
                    </span>
                    <span className="font-mono text-xs font-semibold">{txResult.txId}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {txResult.compliantWithPolicy ? (
                      <span className="badge badge-success gap-1 text-xs">
                        <CheckCircleIcon className="w-3.5 h-3.5" /> Policy Compliant
                      </span>
                    ) : (
                      <span className="badge badge-error gap-1 text-xs">
                        <XCircleIcon className="w-3.5 h-3.5" /> Policy Violation
                      </span>
                    )}
                  </div>
                </div>

                <div className="p-4 space-y-3 text-xs">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 border-b border-base-300/50">
                    <span className="text-base-content/60 font-semibold">Payer Account</span>
                    <span className="sm:col-span-2 font-mono font-medium">{txResult.payer || "—"}</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 border-b border-base-300/50">
                    <span className="text-base-content/60 font-semibold">Credited Payees</span>
                    <div className="sm:col-span-2 font-mono space-y-1">
                      {txResult.credits && txResult.credits.length > 0 ? (
                        txResult.credits.map((c, i) => (
                          <div key={i} className="text-primary font-semibold">
                            +{c.amountHbar} ℏ → {c.account}
                          </div>
                        ))
                      ) : (
                        <span className="text-base-content/50">No non-system credits</span>
                      )}
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 border-b border-base-300/50">
                    <span className="text-base-content/60 font-semibold">Consensus Timestamp</span>
                    <span className="sm:col-span-2 font-mono text-base-content/80">
                      {txResult.consensusTimestamp
                        ? `${new Date(Number(txResult.consensusTimestamp.split(".")[0]) * 1000).toUTCString()} (${txResult.consensusTimestamp})`
                        : "—"}
                    </span>
                  </div>

                  {txResult.violations && txResult.violations.length > 0 && (
                    <div className="p-3 bg-error/10 rounded-lg text-error space-y-1">
                      <span className="font-bold block">Compliance Violations:</span>
                      {txResult.violations.map((v, i) => (
                        <div key={i}>• {v}</div>
                      ))}
                    </div>
                  )}

                  <div className="pt-2 flex justify-between items-center">
                    <a
                      href={txHashScanUrl(txResult.txId || "")}
                      target="_blank"
                      rel="noreferrer"
                      className="btn btn-xs btn-outline btn-primary gap-1"
                    >
                      View on HashScan <ArrowTopRightOnSquareIcon className="w-3.5 h-3.5" />
                    </a>
                    <span className="text-[11px] text-base-content/50">Verified directly via Hedera Mirror Node</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* HCS-2 Policy Version Registry Timeline */}
      <div className="mt-8 bg-base-100 p-6 rounded-2xl border border-base-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ClockIcon className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">HCS-2 Versioned Policy History</h2>
          </div>
          <span className="badge badge-sm badge-neutral font-mono">
            {data?.policyHistory?.length || 0} Versions Registered
          </span>
        </div>
        <p className="text-xs text-base-content/70 mb-4">
          Every spending policy change is published as an immutable, consensus-timestamped version to the HCS-2 registry
          topic using the owner-only submit key.
        </p>

        {data?.policyHistory && data.policyHistory.length > 0 ? (
          <div className="space-y-4">
            {data.policyHistory.map((v, i) => (
              <div
                key={i}
                className="border border-base-300 rounded-xl p-4 bg-base-200/30 hover:border-primary/40 transition-colors"
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-base-300 pb-2 mb-3">
                  <div className="flex items-center gap-2">
                    <span className="badge badge-primary font-mono text-xs">v{v.version}</span>
                    <span className="font-semibold text-sm">{v.reason || "Policy update"}</span>
                  </div>
                  <div className="text-xs text-base-content/60 font-mono">
                    Seq: #{v.sequenceNumber} • {v.consensusTimestamp || new Date(v.ts).toISOString()}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-xs mb-3">
                  <div className="bg-base-100 p-2.5 rounded-lg border border-base-300">
                    <span className="text-base-content/60 block text-[10px] uppercase font-bold">Per-Task Cap</span>
                    <span className="font-mono font-bold text-sm text-base-content">{v.perTaskHbar} ℏ</span>
                  </div>
                  <div className="bg-base-100 p-2.5 rounded-lg border border-base-300">
                    <span className="text-base-content/60 block text-[10px] uppercase font-bold">24h Daily Cap</span>
                    <span className="font-mono font-bold text-sm text-base-content">{v.perDayHbar} ℏ</span>
                  </div>
                  <div className="bg-base-100 p-2.5 rounded-lg border border-base-300">
                    <span className="text-base-content/60 block text-[10px] uppercase font-bold">Auto-Approval</span>
                    <span className="font-mono font-bold text-sm text-base-content">{v.autoApprovalLimitHbar} ℏ</span>
                  </div>
                  <div className="bg-base-100 p-2.5 rounded-lg border border-base-300">
                    <span className="text-base-content/60 block text-[10px] uppercase font-bold">Mode</span>
                    <span className="font-mono font-bold text-sm text-primary uppercase">{v.mode || "auto"}</span>
                  </div>
                </div>

                <div className="text-xs space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-base-content/60 font-semibold w-24">Allowlist:</span>
                    <div className="flex flex-wrap gap-1">
                      {v.allowlist && v.allowlist.length > 0 ? (
                        v.allowlist.map((acc: string, idx: number) => (
                          <span key={idx} className="badge badge-xs badge-outline font-mono">
                            {acc}
                          </span>
                        ))
                      ) : (
                        <span className="text-base-content/50">None (Restricted)</span>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-base-content/60 font-semibold w-24">Blocked Tools:</span>
                    <div className="flex flex-wrap gap-1">
                      {v.blockedTools && v.blockedTools.length > 0 ? (
                        v.blockedTools.map((t: string, idx: number) => (
                          <span key={idx} className="badge badge-xs badge-neutral font-mono">
                            {t}
                          </span>
                        ))
                      ) : (
                        <span className="text-base-content/50">None</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-base-300 rounded-xl text-base-content/60 text-xs">
            No HCS-2 policy versions registered on-chain yet. Run{" "}
            <code className="bg-base-200 px-1 py-0.5 rounded font-mono text-primary">yarn script:publish-policy</code>{" "}
            to publish the current configuration.
          </div>
        )}
      </div>

      {/* Consensus Audit Trail */}
      <div className="mt-8 bg-base-100 p-6 rounded-2xl border border-base-300 shadow-sm">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <ListBulletIcon className="w-5 h-5 text-primary" />
            <h2 className="text-xl font-bold">Consensus Audit Decision Stream</h2>
          </div>
          <span className="badge badge-sm badge-neutral font-mono">{data?.recentAudits?.length || 0} Records</span>
        </div>

        {data?.recentAudits && data.recentAudits.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="table table-xs w-full">
              <thead>
                <tr>
                  <th>Decision</th>
                  <th>Action</th>
                  <th>Amount</th>
                  <th>Recipient</th>
                  <th>Enforcement</th>
                  <th>Timestamp</th>
                  <th>Tx ID</th>
                </tr>
              </thead>
              <tbody>
                {data.recentAudits.map((a, idx) => (
                  <tr key={idx} className="hover">
                    <td>
                      <span
                        className={`badge badge-xs font-mono font-bold ${
                          a.decision === "ALLOW"
                            ? "badge-success"
                            : a.decision === "ESCALATE"
                              ? "badge-warning"
                              : "badge-error"
                        }`}
                      >
                        {a.decision}
                      </span>
                    </td>
                    <td className="font-mono text-[11px]">{a.action}</td>
                    <td className="font-mono font-bold text-primary">{a.amountHbar} ℏ</td>
                    <td className="font-mono text-[11px]">{a.recipient}</td>
                    <td>
                      <span className="badge badge-xs badge-outline font-mono text-[10px]">{a.enforcement}</span>
                    </td>
                    <td className="text-[11px] text-base-content/70">{new Date(a.timestamp).toLocaleTimeString()}</td>
                    <td>
                      {a.txId ? (
                        <button
                          onClick={() => verifyTransaction(a.txId)}
                          className="btn btn-ghost btn-xs font-mono text-[10px] text-primary p-0 underline"
                          title="Verify on Hedera"
                        >
                          {a.txId.slice(0, 16)}...
                        </button>
                      ) : (
                        <span className="text-base-content/40">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="text-center py-8 border border-dashed border-base-300 rounded-xl text-base-content/60 text-xs">
            No audit records found on HCS topic yet. Payments processed by SpendGuard will automatically record here.
          </div>
        )}
      </div>
    </div>
  );
}
