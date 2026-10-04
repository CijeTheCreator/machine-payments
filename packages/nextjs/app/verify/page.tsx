"use client";

import React, { useCallback, useEffect, useState } from "react";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  DocumentCheckIcon,
  ExclamationTriangleIcon,
  MagnifyingGlassIcon,
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
          error: `Mirror Node error: HTTP ${res.status} ${res.statusText}`,
        });
        return;
      }

      const json = await res.json();
      const tx = json.transactions && json.transactions[0];
      if (!tx) {
        setTxResult({
          state: "fail",
          txId: cleanId,
          error: "No transaction records returned for this ID.",
        });
        return;
      }

      const transfers: Array<{ account: string; amount: number }> = tx.transfers || [];
      const credits: Array<{ account: string; amountHbar: number }> = [];
      let payer = "0.0.unknown";

      for (const t of transfers) {
        const isSystemFeeAccount = ["0.0.98", "0.0.800", "0.0.801"].includes(t.account);
        if (t.amount < 0 && !isSystemFeeAccount) {
          payer = t.account;
        } else if (t.amount > 0 && !isSystemFeeAccount) {
          credits.push({
            account: t.account,
            amountHbar: t.amount / 1e8,
          });
        }
      }

      const activePolicy = data?.activePolicy;
      const violations: string[] = [];
      let compliantWithPolicy = true;

      if (activePolicy) {
        for (const c of credits) {
          if (activePolicy.perTaskHbar && c.amountHbar > activePolicy.perTaskHbar) {
            violations.push(`Payment of ${c.amountHbar} HBAR exceeds per-task cap (${activePolicy.perTaskHbar} HBAR)`);
            compliantWithPolicy = false;
          }
          if (
            activePolicy.allowlist &&
            activePolicy.allowlist.length > 0 &&
            !activePolicy.allowlist.includes(c.account)
          ) {
            violations.push(`Recipient ${c.account} is not on the active allowlist`);
            compliantWithPolicy = false;
          }
        }
      }

      setTxResult({
        state: "ok",
        txId: cleanId,
        payer,
        status: tx.result,
        consensusTimestamp: tx.consensus_timestamp,
        credits,
        compliantWithPolicy,
        violations,
      });
    } catch (err: any) {
      setTxResult({
        state: "fail",
        txId: cleanId,
        error: err.message || "Failed to reach Hedera Mirror Node",
      });
    }
  };

  const topicHashScanUrl = (topicId: string) => `https://hashscan.io/testnet/topic/${topicId}`;
  const txHashScanUrl = (txId: string) => {
    const formatted = txId.replace("@", "-").replace(/\.(\d+)$/, "-$1");
    return `https://hashscan.io/testnet/transaction/${formatted}`;
  };

  return (
    <div className="flex-1 bg-[#fafafb] text-[#111114] select-none py-8 px-4 sm:px-6">
      <div className="max-w-6xl mx-auto w-full space-y-6">
        {/* Page Title & Controls */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between pb-4 border-b border-[#00000014] gap-4">
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-[#111114]">Ledger Verification & Policy Registry</h1>
              {data?.isOfflineFallback && (
                <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#f6f6f9] border border-[#00000014] text-[#8d5400]">
                  Offline Mode
                </span>
              )}
            </div>
            <p className="text-xs text-[#5a5a61] mt-1 max-w-2xl">
              Reconcile agent memory against public Hedera consensus messages, inspect HCS-2 policy version history, and
              cryptographically verify payment receipts.
            </p>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={() => fetchData(true)}
              disabled={refreshing || loading}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white hover:bg-[#eeeef1] border border-[#00000014] text-[#111114] transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <ArrowPathIcon
                className={`size-3.5 ${refreshing || loading ? "animate-spin text-[#005fad]" : "text-[#797981]"}`}
              />
              <span>{loading ? "Loading..." : "Refresh"}</span>
            </button>
          </div>
        </div>

        {/* Topics & Network Metadata Banner */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div className="bg-white p-4 rounded-xl border border-[#00000014] shadow-xs flex flex-col justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#797981] font-mono font-semibold">
              HCS Audit Topic
            </span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-[#111114]">{data?.auditTopicId || "Unset"}</span>
              {data?.auditTopicId && (
                <a
                  href={topicHashScanUrl(data.auditTopicId)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-[#005fad] hover:underline inline-flex items-center gap-1"
                >
                  HashScan <ArrowTopRightOnSquareIcon className="size-3" />
                </a>
              )}
            </div>
            <span className="text-[11px] text-[#797981] mt-1">agent-spend-audit topic</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#00000014] shadow-xs flex flex-col justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#797981] font-mono font-semibold">
              HCS-2 Policy Registry
            </span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-[#111114]">{data?.policyTopicId || "Unset"}</span>
              {data?.policyTopicId && (
                <a
                  href={topicHashScanUrl(data.policyTopicId)}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono text-xs text-[#005fad] hover:underline inline-flex items-center gap-1"
                >
                  HashScan <ArrowTopRightOnSquareIcon className="size-3" />
                </a>
              )}
            </div>
            <span className="text-[11px] text-[#797981] mt-1">hcs-2 policy topic</span>
          </div>

          <div className="bg-white p-4 rounded-xl border border-[#00000014] shadow-xs flex flex-col justify-between">
            <span className="text-[11px] uppercase tracking-wider text-[#797981] font-mono font-semibold">
              Governed Agent Account
            </span>
            <div className="mt-2 flex items-center justify-between">
              <span className="font-mono text-sm font-semibold text-[#005fad]">{data?.agentAccountId || "0.0.X"}</span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#f6f6f9] border border-[#00000014] text-[#111114]">
                {data?.activePolicy?.mode || "auto"}
              </span>
            </div>
            <span className="text-[11px] text-[#797981] mt-1">Multi-tier spending policy</span>
          </div>
        </div>

        {/* Reconciliation Meter */}
        <div className="bg-white p-5 rounded-xl border border-[#00000014] shadow-xs">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-center gap-3">
              {data?.match ? (
                <div className="size-9 rounded-full bg-emerald-50 text-[#186a23] flex items-center justify-center shrink-0">
                  <CheckCircleIcon className="size-5" />
                </div>
              ) : (
                <div className="size-9 rounded-full bg-red-50 text-[#be222a] flex items-center justify-center shrink-0">
                  <ExclamationTriangleIcon className="size-5" />
                </div>
              )}
              <div>
                <h2 className="text-sm font-bold text-[#111114]">
                  {data?.match ? "Consensus Reconciliation: Matches Exactly" : "State Divergence Detected"}
                </h2>
                <p className="text-xs text-[#797981] mt-0.5">
                  Independent recalculation of 24h rolling spend from public Mirror Node consensus messages.
                </p>
              </div>
            </div>

            <div className="flex items-center gap-6">
              <div className="text-right">
                <span className="text-[11px] uppercase tracking-wider text-[#797981] font-mono font-medium block">
                  Local Store Spend
                </span>
                <span className="font-mono text-lg font-bold text-[#111114]">
                  {data ? `${data.kvSpentHbar} ℏ` : "..."}
                </span>
              </div>
              <div className="text-right border-l border-[#00000014] pl-6">
                <span className="text-[11px] uppercase tracking-wider text-[#797981] font-mono font-medium block">
                  HCS Consensus Spend
                </span>
                <span className="font-mono text-lg font-bold text-[#005fad]">
                  {data ? `${data.hcsSpentHbar} ℏ` : "..."}
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Interactive Transaction Verifier */}
        <div className="bg-white p-5 rounded-xl border border-[#00000014] shadow-xs space-y-4">
          <div className="flex items-center gap-2">
            <DocumentCheckIcon className="size-5 text-[#005fad]" />
            <h2 className="text-sm font-bold text-[#111114]">Cryptographic Transaction Receipt Verifier</h2>
          </div>
          <p className="text-xs text-[#797981]">
            Inspect any Hedera transaction ID on the public Mirror Node and verify adherence to the active spend policy.
          </p>

          <div className="flex flex-col sm:flex-row gap-2">
            <input
              type="text"
              value={txInput}
              onChange={e => setTxInput(e.target.value)}
              onKeyDown={e => e.key === "Enter" && verifyTransaction(txInput)}
              placeholder="e.g. 0.0.12345@1710000000.000000000 or 0.0.12345-1710000000-000000000"
              className="flex-1 rounded-xl border border-black/10 bg-white hover:border-black/20 focus:border-[#111114] focus:ring-1 focus:ring-[#111114] outline-none font-mono text-xs px-3 py-2 text-[#111114] placeholder-[#797981]"
            />
            <button
              onClick={() => verifyTransaction(txInput)}
              disabled={!txInput.trim() || txResult.state === "loading"}
              className="inline-flex items-center justify-center gap-1.5 px-4 py-2 rounded-xl text-xs font-semibold bg-[#111114] text-white hover:bg-black/90 disabled:opacity-50 transition-all shadow-sm cursor-pointer"
            >
              <MagnifyingGlassIcon className="size-3.5" />
              Verify on Hedera
            </button>
          </div>

          {/* Quick Picks from Recent Audits */}
          {data?.recentAudits && data.recentAudits.filter(a => a.txId).length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 text-xs text-[#797981]">
              <span className="font-medium mr-1 text-[#111114]">Recent:</span>
              {data.recentAudits
                .filter(a => a.txId)
                .slice(0, 4)
                .map((a, idx) => (
                  <button
                    key={idx}
                    onClick={() => verifyTransaction(a.txId)}
                    className="font-mono text-[11px] px-2 py-0.5 rounded-md bg-[#f6f6f9] hover:bg-[#eeeef1] border border-[#00000014] text-[#111114] transition-colors cursor-pointer"
                  >
                    {a.amountHbar} ℏ → {a.recipient}
                  </button>
                ))}
            </div>
          )}

          {/* Verification Result Display */}
          {txResult.state !== "idle" && (
            <div className="border border-[#00000014] rounded-xl overflow-hidden bg-[#fafafb]">
              {txResult.state === "loading" && (
                <div className="p-6 flex items-center justify-center gap-2 text-xs font-mono text-[#797981]">
                  <ArrowPathIcon className="size-4 animate-spin text-[#005fad]" />
                  Querying Hedera Mirror Node consensus records...
                </div>
              )}

              {txResult.state === "fail" && (
                <div className="p-4 bg-red-50 text-[#be222a] border-l-4 border-[#be222a] text-xs font-mono">
                  ✗ {txResult.error}
                </div>
              )}

              {txResult.state === "ok" && (
                <div>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3.5 border-b border-[#00000014] bg-white gap-2">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-emerald-50 text-[#186a23] font-semibold border border-emerald-200">
                        {txResult.status}
                      </span>
                      <span className="font-mono text-xs font-semibold text-[#111114]">{txResult.txId}</span>
                    </div>
                    <div className="flex items-center gap-2">
                      {txResult.compliantWithPolicy ? (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#186a23]">
                          <CheckCircleIcon className="size-3.5" /> Policy Compliant
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-xs font-medium text-[#be222a]">
                          <XCircleIcon className="size-3.5" /> Policy Violation
                        </span>
                      )}
                    </div>
                  </div>

                  <div className="p-4 space-y-2.5 text-xs">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 border-b border-[#00000014]">
                      <span className="text-[#797981] font-medium">Payer Account</span>
                      <span className="sm:col-span-2 font-mono font-medium text-[#111114]">
                        {txResult.payer || "—"}
                      </span>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 border-b border-[#00000014]">
                      <span className="text-[#797981] font-medium">Credited Payees</span>
                      <div className="sm:col-span-2 font-mono space-y-1">
                        {txResult.credits && txResult.credits.length > 0 ? (
                          txResult.credits.map((c, i) => (
                            <div key={i} className="text-[#186a23] font-semibold">
                              +{c.amountHbar} ℏ → {c.account}
                            </div>
                          ))
                        ) : (
                          <span className="text-[#797981]">No non-system credits</span>
                        )}
                      </div>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 py-1 border-b border-[#00000014]">
                      <span className="text-[#797981] font-medium">Consensus Timestamp</span>
                      <span className="sm:col-span-2 font-mono text-[#5a5a61]">
                        {txResult.consensusTimestamp
                          ? `${new Date(Number(txResult.consensusTimestamp.split(".")[0]) * 1000).toUTCString()} (${txResult.consensusTimestamp})`
                          : "—"}
                      </span>
                    </div>

                    {txResult.violations && txResult.violations.length > 0 && (
                      <div className="p-3 bg-red-50 rounded-lg text-[#be222a] space-y-1 border border-red-200">
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
                        className="font-mono text-xs text-[#005fad] hover:underline inline-flex items-center gap-1"
                      >
                        View on HashScan <ArrowTopRightOnSquareIcon className="size-3" />
                      </a>
                      <span className="text-[11px] text-[#797981]">Verified directly via Mirror Node</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* HCS-2 Policy Version Registry Timeline */}
        <div className="bg-white p-5 rounded-xl border border-[#00000014] shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ClockIcon className="size-5 text-[#005fad]" />
              <h2 className="text-sm font-bold text-[#111114]">HCS-2 Versioned Policy History</h2>
            </div>
            <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-[#f6f6f9] border border-[#00000014] text-[#111114]">
              {data?.policyHistory?.length || 0} Versions
            </span>
          </div>
          <p className="text-xs text-[#797981]">
            Every spending policy change is published as an immutable, consensus-timestamped version to the HCS-2
            registry topic.
          </p>

          {data?.policyHistory && data.policyHistory.length > 0 ? (
            <div className="space-y-3">
              {data.policyHistory.map((v, i) => (
                <div
                  key={i}
                  className="border border-[#00000014] rounded-xl p-4 bg-[#fafafb] hover:border-[#111114]/30 transition-colors"
                >
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-[#00000014] pb-2 mb-3">
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] font-mono px-2 py-0.5 rounded-md bg-white border border-[#00000014] text-[#111114] font-bold">
                        v{v.version}
                      </span>
                      <span className="font-semibold text-xs text-[#111114]">{v.reason || "Policy update"}</span>
                    </div>
                    <div className="text-[11px] text-[#797981] font-mono">
                      Seq: #{v.sequenceNumber} • {v.consensusTimestamp || new Date(v.ts).toISOString()}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 text-xs mb-3">
                    <div className="bg-white p-2.5 rounded-lg border border-[#00000014]">
                      <span className="text-[#797981] block text-[10px] uppercase font-mono font-bold">
                        Per-Task Cap
                      </span>
                      <span className="font-mono font-bold text-sm text-[#111114]">{v.perTaskHbar} ℏ</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#00000014]">
                      <span className="text-[#797981] block text-[10px] uppercase font-mono font-bold">
                        24h Daily Cap
                      </span>
                      <span className="font-mono font-bold text-sm text-[#111114]">{v.perDayHbar} ℏ</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#00000014]">
                      <span className="text-[#797981] block text-[10px] uppercase font-mono font-bold">
                        Auto-Approval
                      </span>
                      <span className="font-mono font-bold text-sm text-[#111114]">{v.autoApprovalLimitHbar} ℏ</span>
                    </div>
                    <div className="bg-white p-2.5 rounded-lg border border-[#00000014]">
                      <span className="text-[#797981] block text-[10px] uppercase font-mono font-bold">Mode</span>
                      <span className="font-mono font-bold text-sm text-[#005fad] uppercase">{v.mode || "auto"}</span>
                    </div>
                  </div>

                  <div className="text-xs space-y-1">
                    <div className="flex items-center gap-2">
                      <span className="text-[#797981] font-medium w-24">Allowlist:</span>
                      <div className="flex flex-wrap gap-1">
                        {v.allowlist && v.allowlist.length > 0 ? (
                          v.allowlist.map((acc: string, idx: number) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#00000014] text-[#111114]"
                            >
                              {acc}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#797981]">None (Restricted)</span>
                        )}
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[#797981] font-medium w-24">Blocked Tools:</span>
                      <div className="flex flex-wrap gap-1">
                        {v.blockedTools && v.blockedTools.length > 0 ? (
                          v.blockedTools.map((t: string, idx: number) => (
                            <span
                              key={idx}
                              className="font-mono text-[10px] px-1.5 py-0.5 rounded bg-white border border-[#00000014] text-[#111114]"
                            >
                              {t}
                            </span>
                          ))
                        ) : (
                          <span className="text-[#797981]">None</span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-8 border border-dashed border-[#00000014] rounded-xl text-[#797981] text-xs">
              No HCS-2 policy versions registered on-chain yet.
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
