"use client";

import React, { Suspense, useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { AgentStatePill } from "@/components/ui/AgentStatePill";
import { AgentRecord, DashboardStats, SpendEvent } from "@/services/agents/types";
import { ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";

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
    const interval = setInterval(fetchAgentData, 10000);
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
      setCapSuccess("Spend cap updated");
      setTimeout(() => setCapSuccess(null), 3000);
    } catch (err) {
      setCapError((err as Error).message || "Update failed");
    } finally {
      setSavingCap(false);
    }
  };

  if (loading) {
    return (
      <div className="flex-1 bg-[#fafafb] flex items-center justify-center p-8">
        <div className="text-xs font-mono text-[#797981] flex items-center gap-2">
          <ArrowPathIcon className="size-4 animate-spin" />
          Loading telemetry...
        </div>
      </div>
    );
  }

  const spendEvents: SpendEvent[] = stats?.recentActivity || [];

  return (
    <div className="flex-1 bg-[#fafafb] flex flex-col min-h-screen text-[#111114] select-none">
      {/* Main View Container */}
      <div className="max-w-6xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8 space-y-6">
        {/* Title and Agent Identity Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-2">
          <div>
            <div className="flex items-center gap-3">
              <h1 className="text-xl font-bold tracking-tight text-[#111114]">Autonomous Payments</h1>
              {agent && <AgentStatePill state={agent.state} />}
            </div>
            <div className="text-xs text-[#797981] mt-1 flex flex-wrap items-center gap-2">
              <span>
                Agent: <strong className="text-[#111114] font-medium">{agent?.label || "Buyer"}</strong>
              </span>
              <span>•</span>
              <span className="font-mono">{agent?.id}</span>
              {agent?.accountId && (
                <>
                  <span>•</span>
                  <a
                    href={`https://hashscan.io/testnet/account/${agent.accountId}`}
                    target="_blank"
                    rel="noreferrer"
                    className="font-mono text-[#005fad] hover:underline inline-flex items-center gap-0.5"
                  >
                    {agent.accountId}
                    <ArrowTopRightOnSquareIcon className="size-3" />
                  </a>
                </>
              )}
            </div>
          </div>

          <div className="flex items-center gap-2 self-start sm:self-auto">
            <button
              onClick={handleManualRefresh}
              disabled={refreshing}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white hover:bg-[#eeeef1] border border-[#00000014] text-[#111114] transition-colors shadow-2xs cursor-pointer disabled:opacity-50"
            >
              <ArrowPathIcon className={`size-3.5 ${refreshing ? "animate-spin text-[#005fad]" : "text-[#797981]"}`} />
              <span>{refreshing ? "Syncing..." : "Refresh"}</span>
            </button>
            <button
              onClick={handleSignOut}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium bg-white hover:bg-[#eeeef1] border border-[#00000014] text-[#797981] hover:text-[#be222a] transition-colors shadow-2xs cursor-pointer"
            >
              Sign Out
            </button>
          </div>
        </div>

        {/* Spend Cap Edit Inline Bar */}
        {editingCap && (
          <form
            onSubmit={handleUpdateCap}
            className="p-3 bg-white border border-[#00000014] rounded-lg shadow-xs flex flex-wrap items-center gap-3 animate-in fade-in"
          >
            <span className="text-xs font-medium text-[#111114]">New Spend Cap (HBAR):</span>
            <input
              type="number"
              min="0.01"
              step="any"
              value={newCapInput}
              onChange={e => setNewCapInput(e.target.value)}
              className="px-2.5 py-1 text-xs font-mono border border-black/10 rounded-md w-32 outline-none focus:border-[#111114]"
              autoFocus
            />
            <button
              type="submit"
              disabled={savingCap}
              className="px-3 py-1 text-xs font-semibold bg-[#111114] text-white rounded-md hover:bg-black/90 disabled:opacity-50 cursor-pointer"
            >
              {savingCap ? "Saving..." : "Save Cap"}
            </button>
            <button
              type="button"
              onClick={() => {
                setEditingCap(false);
                setCapError(null);
              }}
              className="px-3 py-1 text-xs text-[#797981] hover:text-[#111114] cursor-pointer"
            >
              Cancel
            </button>
            {capError && <span className="text-xs text-[#be222a]">{capError}</span>}
          </form>
        )}

        {capSuccess && (
          <div className="p-2.5 bg-emerald-50 text-[#186a23] border border-emerald-200/80 rounded-lg text-xs font-medium">
            {capSuccess}
          </div>
        )}

        {/* Firecrawl-Style Segmented Stat Card Header Container */}
        <div className="border border-[#00000014] bg-white rounded-lg shadow-xs overflow-hidden">
          <div className="flex flex-wrap lg:flex-nowrap divide-y lg:divide-y-0 lg:divide-x divide-[#00000014]">
            {/* Card 1: HBAR Balance */}
            <div className="flex-1 min-w-[200px] px-5 py-4">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#797981] mb-1">Account Balance</div>
              <div className="text-2xl font-semibold tabular-nums text-[#111114]">
                {balance.hbar} <span className="text-xs font-normal text-[#797981] font-sans">HBAR</span>
              </div>
              <div className="text-xs text-[#797981] mt-0.5 truncate font-mono">
                {Number(balance.tinybar).toLocaleString()} tinybar
              </div>
            </div>

            {/* Card 2: Total Autonomous Spend */}
            <div className="flex-1 min-w-[200px] px-5 py-4">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#797981] mb-1">
                Total Machine Spend
              </div>
              <div className="text-2xl font-semibold tabular-nums text-[#111114]">
                {agent?.totalSpentTinybar
                  ? (Number(agent.totalSpentTinybar) / 1e8).toFixed(4)
                  : stats?.spend24hHbar || "0.0000"}{" "}
                <span className="text-xs font-normal text-[#797981] font-sans">HBAR</span>
              </div>
              <div className="text-xs text-[#797981] mt-0.5 truncate">{spendEvents.length} recorded payments</div>
            </div>

            {/* Card 3: Spend Cap / Threshold */}
            <div className="flex-1 min-w-[200px] px-5 py-4">
              <div className="font-mono text-[11px] uppercase tracking-wider text-[#797981] mb-1 flex items-center justify-between">
                <span>Spend Cap</span>
                {agent && (
                  <button
                    onClick={() => {
                      setEditingCap(!editingCap);
                      setNewCapInput(String(agent.spendLimitHbar));
                    }}
                    className="text-[11px] text-[#005fad] hover:underline cursor-pointer lowercase font-sans font-medium"
                  >
                    {editingCap ? "close" : "edit"}
                  </button>
                )}
              </div>
              <div className="text-2xl font-semibold tabular-nums text-[#111114]">
                {agent?.spendLimitHbar ?? 10} <span className="text-xs font-normal text-[#797981] font-sans">HBAR</span>
              </div>
              <div className="text-xs text-[#797981] mt-0.5 truncate">Max safe budget</div>
            </div>
          </div>
        </div>

        {/* Spend Events Table matching SubscriptionsView.tsx */}
        <div className="border border-[#00000014] bg-white rounded-lg shadow-xs overflow-hidden flex flex-col">
          {/* Table Header */}
          <div className="bg-[#f6f6f9] border-b border-[#00000014] px-5 py-3 text-[11px] font-semibold text-[#797981] uppercase tracking-wider flex items-center justify-between select-none shrink-0">
            <div className="w-5/12 sm:w-1/2">Service</div>
            <div className="w-4/12 sm:w-1/4">Cost (Tinybar / HBAR)</div>
            <div className="w-3/12 sm:w-1/4 text-right pr-2">Status / Hash</div>
          </div>

          {/* Table Body */}
          <div className="divide-y divide-[#00000014]">
            {spendEvents.length === 0 ? (
              <div className="p-16 text-center flex flex-col items-center justify-center gap-2 text-[#797981]">
                <p className="font-semibold text-xs text-[#111114]">No transactions recorded</p>
                <p className="text-[11px] text-[#797981] max-w-sm">
                  Autonomous machine micropayments initiated by this agent will appear here in real time.
                </p>
              </div>
            ) : (
              spendEvents.map((ev, idx) => {
                const dateStr = new Date(ev.timestamp).toLocaleString([], {
                  month: "short",
                  day: "numeric",
                  hour: "2-digit",
                  minute: "2-digit",
                });

                return (
                  <div
                    key={ev.id || idx}
                    className="flex items-center justify-between px-5 py-3.5 hover:bg-[#eeeef1]/40 transition-colors"
                  >
                    {/* Left: Route / Agent */}
                    <div className="w-5/12 sm:w-1/2 min-w-0 pr-4">
                      <div className="text-xs font-semibold text-[#111114] truncate font-mono">
                        {ev.route || "Autonomous Micropayment"}
                      </div>
                      <div className="text-[11px] text-[#797981] truncate">
                        By: <span className="font-medium text-[#111114]">{ev.agentLabel || ev.agentId}</span>
                        {ev.hcsSequenceNumber && (
                          <span className="font-mono ml-1.5">• HCS #{ev.hcsSequenceNumber}</span>
                        )}
                      </div>
                    </div>

                    {/* Middle: Amount */}
                    <div className="w-4/12 sm:w-1/4 min-w-0">
                      <div className="text-sm font-semibold tabular-nums text-[#111114]">
                        {ev.amountHbar || (Number(ev.amountTinybar) / 1e8).toFixed(4)}{" "}
                        <span className="text-xs font-normal text-[#797981]">HBAR</span>
                      </div>
                      <div className="font-mono text-[11px] text-[#797981]">
                        {Number(ev.amountTinybar).toLocaleString()} tb
                      </div>
                    </div>

                    {/* Right: Status / Link */}
                    <div className="w-3/12 sm:w-1/4 text-right pr-2">
                      <div className="flex items-center justify-end gap-1.5">
                        <span className="size-1.5 rounded-full bg-[#186a23]" />
                        <span className="text-xs font-medium text-[#186a23]">Settled</span>
                      </div>
                      <div className="text-[11px] text-[#797981] mt-0.5">
                        {ev.txId ? (
                          <a
                            href={`https://hashscan.io/testnet/transaction/${ev.txId}`}
                            target="_blank"
                            rel="noreferrer"
                            className="font-mono text-[#005fad] hover:underline inline-flex items-center gap-0.5"
                          >
                            <span>{ev.txId.slice(0, 10)}...</span>
                            <ArrowTopRightOnSquareIcon className="size-2.5" />
                          </a>
                        ) : (
                          <span>{dateStr}</span>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafb] flex items-center justify-center text-xs font-mono text-[#797981]">
          Loading...
        </div>
      }
    >
      <DashboardContent />
    </Suspense>
  );
}
