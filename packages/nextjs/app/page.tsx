"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { AgentStatePill } from "@/components/ui/AgentStatePill";
import { KpiRow, KpiTile } from "@/components/ui/KpiTile";
import { SpendChart } from "@/components/ui/SpendChart";
import { AgentRecord, DashboardStats, SpendEvent } from "@/services/agents/types";
import {
  ArrowPathIcon,
  ArrowRightOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  BanknotesIcon,
  BoltIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  CodeBracketIcon,
  PencilSquareIcon,
  ShieldCheckIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";

function DashboardContent() {
  const router = useRouter();

  const [activeSession, setActiveSession] = useState<{
    id: string;
    label?: string;
    apiKey?: string;
    accountId?: string;
    walletAddress?: string;
  } | null>(null);

  const [agent, setAgent] = useState<AgentRecord | null>(null);
  const [balance, setBalance] = useState<{ hbar: string; tinybar: string }>({ hbar: "0", tinybar: "0" });
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [copiedHeader, setCopiedHeader] = useState(false);

  // Spend cap management state
  const [editingCap, setEditingCap] = useState(false);
  const [newCapInput, setNewCapInput] = useState<string>("");
  const [savingCap, setSavingCap] = useState(false);
  const [capError, setCapError] = useState<string | null>(null);
  const [capSuccess, setCapSuccess] = useState<string | null>(null);

  // 1. Gate access: verify onboarded session in localStorage
  useEffect(() => {
    try {
      const stored = localStorage.getItem("mmp_active_agent");
      if (!stored) {
        router.replace("/onboarding?error=not_onboarded");
        return;
      }
      const parsed = JSON.parse(stored);
      if (!parsed?.id) {
        router.replace("/onboarding?error=not_onboarded");
        return;
      }
      setActiveSession(parsed);
    } catch {
      router.replace("/onboarding?error=not_onboarded");
    }
  }, [router]);

  // 2. Fetch buyer agent telemetry
  const fetchAgentData = useCallback(async () => {
    if (!activeSession?.id) return;

    try {
      const [agentRes, statsRes] = await Promise.all([
        fetch(`/api/agents/${activeSession.id}`),
        fetch("/api/dashboard/stats"),
      ]);

      if (agentRes.ok) {
        const agentData = await agentRes.json();
        setAgent(agentData.agent);
        if (agentData.balance) {
          setBalance(agentData.balance);
        }
      }

      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }
    } catch {
      // Defensive
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeSession?.id]);

  useEffect(() => {
    if (!activeSession?.id) return;
    fetchAgentData();
    const interval = setInterval(fetchAgentData, 10000); // 10s auto-refresh
    return () => clearInterval(interval);
  }, [activeSession?.id, fetchAgentData]);

  const handleManualRefresh = () => {
    setRefreshing(true);
    fetchAgentData();
  };

  const handleSignOut = () => {
    localStorage.removeItem("mmp_active_agent");
    router.push("/onboarding");
  };

  const handleUpdateCap = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!agent?.id) return;
    const val = parseFloat(newCapInput);
    if (isNaN(val) || val <= 0) {
      setCapError("Cap must be greater than 0 HBAR");
      return;
    }
    const currentSpent = Number(agent?.totalSpentTinybar || "0") / 1e8;
    if (val < currentSpent) {
      setCapError(`Cap cannot be less than current spend (${currentSpent.toFixed(4)} HBAR)`);
      return;
    }

    setSavingCap(true);
    setCapError(null);
    try {
      const res = await fetch(`/api/agents/${agent.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ spendLimitHbar: val }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to update spend cap");
      }
      const data = await res.json();
      setAgent(data.agent);
      setEditingCap(false);
      setCapSuccess(`Spend cap updated to ${val} HBAR`);
      setTimeout(() => setCapSuccess(null), 3000);
    } catch (err) {
      setCapError((err as Error).message || "Update failed");
    } finally {
      setSavingCap(false);
    }
  };

  // Filter recent settlements for this specific agent
  const agentActivity = (stats?.recentActivity || []).filter(
    (e: SpendEvent) => e.agentId === activeSession?.id || (agent?.accountId && e.agentId === agent.accountId),
  );

  const spentHbar = (Number(agent?.totalSpentTinybar || "0") / 1e8).toFixed(4);
  const capHbar = agent?.spendLimitHbar ?? 10;
  const percentUsed = Math.min(100, (Number(spentHbar) / capHbar) * 100);

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const sampleRequestCmd = `curl -X GET "${siteOrigin}/api/x402/resource" \\\n  -H "X-Agent-ID: ${agent?.id || activeSession?.id || ""}"`;

  if (loading && !agent) {
    return (
      <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/50 font-mono text-sm">
        <ArrowPathIcon className="w-5 h-5 animate-spin mr-2 text-[#4ade80]" /> Loading agent spend telemetry…
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#050505] text-[#f4f4f4] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-5xl mx-auto flex flex-col gap-8">
        {/* Agent Profile Header */}
        <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-6 sm:p-8 flex flex-col gap-6">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-5">
            <div>
              <div className="flex items-center gap-2 text-[#4ade80] text-xs uppercase font-mono tracking-widest mb-1">
                <span>●</span> Buyer Agent Telemetry
              </div>
              <div className="flex items-center gap-3">
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  {agent?.label || activeSession?.label || "Client Agent"}
                </h1>
                <AgentStatePill state={agent?.state || "minted"} />
              </div>
              <div className="text-xs text-white/40 font-mono mt-1">ID: {agent?.id || activeSession?.id}</div>
            </div>

            <div className="flex items-center gap-2 self-start sm:self-auto">
              <Link
                href="/onboarding?new=1"
                className="flex items-center gap-1.5 bg-[#141414] hover:bg-white/10 border border-white/10 rounded-lg text-xs font-mono py-2 px-3 text-white/70 hover:text-white transition-colors"
                title="Provision another agent"
              >
                <UserPlusIcon className="w-4 h-4 text-[#4ade80]" />
                <span className="hidden sm:inline">Add Agent</span>
              </Link>

              <button
                onClick={handleManualRefresh}
                disabled={refreshing || loading}
                className="p-2 bg-[#141414] hover:bg-white/10 border border-white/10 rounded-lg text-white/70 transition-colors"
                title="Refresh telemetry"
              >
                <ArrowPathIcon className={`w-4 h-4 ${refreshing ? "animate-spin text-[#4ade80]" : ""}`} />
              </button>

              <button
                onClick={handleSignOut}
                className="flex items-center gap-1.5 bg-[#141414] hover:bg-red-500/10 hover:text-red-400 border border-white/10 rounded-lg text-xs font-mono py-2 px-3 text-white/70 transition-colors"
              >
                <ArrowRightOnRectangleIcon className="w-4 h-4" />
                Disconnect
              </button>
            </div>
          </div>

          {/* Quick Identity Grid */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs font-mono">
            <div className="p-3 bg-[#111111] rounded-xl border border-white/5">
              <div className="text-white/40 uppercase text-[10px]">Hedera Account</div>
              <div className="text-white mt-1 font-semibold truncate select-all">
                {agent?.accountId || activeSession?.accountId || "Unregistered"}
              </div>
            </div>

            <div className="p-3 bg-[#111111] rounded-xl border border-white/5">
              <div className="text-white/40 uppercase text-[10px]">OWS Wallet (EVM)</div>
              <div className="text-white mt-1 font-semibold truncate select-all">
                {agent?.walletAddress || activeSession?.walletAddress || "Pending Handshake"}
              </div>
            </div>

            <div className="p-3 bg-[#111111] rounded-xl border border-white/5">
              <div className="text-white/40 uppercase text-[10px]">Live Mirror Balance</div>
              <div className="text-[#4ade80] mt-1 font-semibold">{Number(balance.hbar).toFixed(4)} HBAR</div>
            </div>
          </div>
        </div>

        {/* Spend Cap Safety Meter */}
        <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs font-mono">
            <span className="text-white font-semibold flex items-center gap-2">
              <BanknotesIcon className="w-4 h-4 text-[#4ade80]" /> Cumulative Spend Safety Cap
            </span>
            <div className="flex items-center gap-3">
              <span className="text-white/60">
                <strong className="text-white">{spentHbar}</strong> / {capHbar} HBAR ({percentUsed.toFixed(1)}%)
              </span>
              {!editingCap && (
                <button
                  onClick={() => {
                    setNewCapInput(String(capHbar));
                    setEditingCap(true);
                    setCapError(null);
                  }}
                  className="flex items-center gap-1 text-[11px] text-[#4ade80] hover:text-[#22c55e] bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md transition-colors"
                >
                  <PencilSquareIcon className="w-3.5 h-3.5" /> Increase / Adjust Cap
                </button>
              )}
            </div>
          </div>

          {/* Progress Bar */}
          <div className="w-full bg-[#141414] h-3 rounded-full overflow-hidden border border-white/10">
            <div
              className={`h-full transition-all duration-500 rounded-full ${
                percentUsed > 90 ? "bg-red-500" : percentUsed > 75 ? "bg-yellow-500" : "bg-[#4ade80]"
              }`}
              style={{ width: `${percentUsed}%` }}
            />
          </div>

          {/* Spend Cap Adjustment Form (expandable) */}
          {editingCap && (
            <form
              onSubmit={handleUpdateCap}
              className="bg-[#111111] border border-white/10 rounded-xl p-4 flex flex-col gap-3 mt-1"
            >
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <div className="text-xs font-semibold text-white">Adjust Spending Safety Cap</div>
                  <div className="text-[11px] text-white/40">Select a preset addition or enter a custom HBAR limit</div>
                </div>
                {/* Quick Presets */}
                <div className="flex items-center gap-1.5">
                  {[5, 10, 25, 50].map(addAmount => {
                    const target = (agent?.spendLimitHbar ?? 10) + addAmount;
                    return (
                      <button
                        key={addAmount}
                        type="button"
                        onClick={() => setNewCapInput(String(target))}
                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-[11px] text-white/80 rounded font-mono transition-colors"
                      >
                        +{addAmount} ℏ
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center gap-2">
                <div className="relative flex-1 max-w-xs">
                  <input
                    type="number"
                    step="0.1"
                    min="0.1"
                    value={newCapInput}
                    onChange={e => setNewCapInput(e.target.value)}
                    placeholder="e.g. 25"
                    className="w-full bg-[#181818] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white font-mono focus:outline-none focus:border-[#4ade80]"
                    autoFocus
                  />
                  <span className="absolute right-3 top-1.5 text-xs text-white/40 font-mono">HBAR</span>
                </div>
                <button
                  type="submit"
                  disabled={savingCap || !newCapInput}
                  className="px-3 py-1.5 bg-[#4ade80] hover:bg-[#22c55e] disabled:opacity-50 text-black font-semibold rounded-lg text-xs font-mono transition-colors"
                >
                  {savingCap ? "Saving…" : "Save New Cap"}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setEditingCap(false);
                    setCapError(null);
                  }}
                  className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-white/60 hover:text-white rounded-lg text-xs font-mono transition-colors"
                >
                  Cancel
                </button>
              </div>

              {capError && <div className="text-[11px] text-red-400 font-mono">{capError}</div>}
            </form>
          )}

          {capSuccess && (
            <div className="text-[11px] text-green-400 font-mono flex items-center gap-1.5 bg-green-500/10 border border-green-500/20 px-3 py-1.5 rounded-lg">
              <CheckIcon className="w-3.5 h-3.5" /> {capSuccess}
            </div>
          )}

          <div className="flex justify-between items-center text-[11px] text-white/40 font-mono">
            <span>Enforced by smart contract vault policy</span>
            <span>Limit: {capHbar} HBAR</span>
          </div>
        </div>

        {/* High-Level Telemetry KPI Cards */}
        <KpiRow>
          <KpiTile
            label="Total Spent"
            value={`${spentHbar} ℏ`}
            hint={`${agentActivity.length} API requests settled`}
            icon={<BanknotesIcon className="w-4 h-4" />}
          />
          <KpiTile
            label="Remaining Budget"
            value={`${Math.max(0, capHbar - Number(spentHbar)).toFixed(4)} ℏ`}
            hint="Available before cap limit"
            icon={<ShieldCheckIcon className="w-4 h-4" />}
          />
          <KpiTile
            label="System Active Agents"
            value={stats?.activeAgents ?? 1}
            hint={`Across ${stats?.totalAgents ?? 1} registered agents`}
            icon={<BoltIcon className="w-4 h-4" />}
          />
        </KpiRow>

        {/* 14-Day Spend Velocity Chart */}
        <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-6">
          <div className="mb-4">
            <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
              14-Day Spend Velocity
            </h2>
            <p className="text-xs text-white/40 mt-0.5">Aggregated micropayments settled over Hedera consensus</p>
          </div>
          <SpendChart data={stats?.chartData || []} height={180} />
        </div>

        {/* Agent Integration Snippet */}
        <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-6 flex flex-col gap-3">
          <div className="flex justify-between items-center">
            <div className="text-xs font-semibold text-white uppercase font-mono flex items-center gap-2">
              <CodeBracketIcon className="w-4 h-4 text-[#60a5fa]" /> x402 Micropayment Invocation
            </div>
            <button
              onClick={async () => {
                await navigator.clipboard.writeText(sampleRequestCmd);
                setCopiedHeader(true);
                setTimeout(() => setCopiedHeader(false), 2000);
              }}
              className="text-xs font-mono text-white/60 hover:text-white flex items-center gap-1.5 bg-white/5 hover:bg-white/10 px-2.5 py-1 rounded-md transition-colors"
            >
              {copiedHeader ? (
                <CheckIcon className="w-3.5 h-3.5 text-green-400" />
              ) : (
                <ClipboardDocumentIcon className="w-3.5 h-3.5" />
              )}
              {copiedHeader ? "Copied" : "Copy cURL"}
            </button>
          </div>
          <p className="text-xs text-white/40">
            Agents settle payments natively by passing their registered ID and bearer credentials in HTTP headers:
          </p>
          <pre className="bg-[#111111] border border-white/10 rounded-xl p-3.5 text-xs font-mono text-white/80 overflow-x-auto">
            {sampleRequestCmd}
          </pre>
        </div>

        {/* Real-Time Consensus Receipts Table */}
        <div className="bg-[#0c0c0c] border border-white/10 rounded-2xl p-6 flex flex-col gap-4">
          <div className="flex justify-between items-center border-b border-white/10 pb-4">
            <div>
              <h2 className="text-sm font-semibold text-white uppercase tracking-wider font-mono">
                Consensus Settlement Receipts
              </h2>
              <p className="text-xs text-white/40 mt-0.5">
                Every settlement is immutably sequenced via Hedera Consensus Service (HCS)
              </p>
            </div>
            <span className="text-xs font-mono text-white/40">{agentActivity.length} events</span>
          </div>

          {agentActivity.length === 0 ? (
            <div className="py-12 text-center text-white/30 text-xs font-mono">
              No transactions recorded yet for this agent. Once requests settle via x402, receipts will appear here in
              real time.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs font-mono">
                <thead>
                  <tr className="border-b border-white/10 text-white/40 uppercase text-[10px]">
                    <th className="py-2.5 px-3">Timestamp</th>
                    <th className="py-2.5 px-3">Resource</th>
                    <th className="py-2.5 px-3">Amount</th>
                    <th className="py-2.5 px-3">HCS Sequence</th>
                    <th className="py-2.5 px-3 text-right">Receipt</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/5">
                  {agentActivity.map((event: SpendEvent, idx: number) => (
                    <tr key={idx} className="hover:bg-white/5 transition-colors">
                      <td className="py-3 px-3 text-white/60 whitespace-nowrap">
                        {new Date(event.timestamp).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                          second: "2-digit",
                        })}
                      </td>
                      <td className="py-3 px-3 text-white font-medium">{event.route}</td>
                      <td className="py-3 px-3 text-[#4ade80] font-semibold whitespace-nowrap">
                        {(Number(event.amountTinybar) / 1e8).toFixed(4)} ℏ
                      </td>
                      <td className="py-3 px-3 text-white/40">#{event.hcsSequenceNumber ?? "Pending"}</td>
                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        {event.txId ? (
                          <a
                            href={`https://hashscan.io/testnet/transaction/${event.txId}`}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1 text-[#60a5fa] hover:underline"
                          >
                            HashScan <ArrowTopRightOnSquareIcon className="w-3 h-3" />
                          </a>
                        ) : (
                          <span className="text-white/30">Local Receipt</span>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default function HomePage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/50 font-mono text-sm">
          Loading dashboard…
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
