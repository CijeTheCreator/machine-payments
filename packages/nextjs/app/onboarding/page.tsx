"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import AuthCanvasBackground from "@/components/ui/AuthCanvasBackground";
import { Crosshair } from "@/components/ui/Crosshair";
import { OnboardingStepper } from "@/components/ui/OnboardingStepper";
import { AgentRecord, AgentState } from "@/services/agents/types";
import { CheckIcon, DocumentDuplicateIcon } from "@heroicons/react/24/outline";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const forceNew = searchParams.get("new") === "1";

  const [label, setLabel] = useState("");
  const [spendLimit, setSpendLimit] = useState("10");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [createdAgent, setCreatedAgent] = useState<{
    claimCode: string;
    agent: AgentRecord;
  } | null>(null);
  const [liveState, setLiveState] = useState<AgentState>("minted");
  const [copiedPrompt, setCopiedPrompt] = useState(false);

  // Check existing session
  useEffect(() => {
    if (forceNew) return;
    try {
      const stored = localStorage.getItem("mmp_active_agent");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id) {
          router.replace("/");
        }
      }
    } catch {
      // Defensive
    }
  }, [router, forceNew]);

  // Poll agent state once created to update the 5-stage stepper
  useEffect(() => {
    if (!createdAgent?.agent.id) return;
    const agentId = createdAgent.agent.id;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.agent) {
            setLiveState(data.agent.state);
            const existing = localStorage.getItem("mmp_active_agent");
            const parsed = existing ? JSON.parse(existing) : {};
            localStorage.setItem(
              "mmp_active_agent",
              JSON.stringify({
                ...parsed,
                ...data.agent,
              }),
            );

            if (data.agent.state === "funded" || data.agent.state === "active") {
              setTimeout(() => {
                router.push("/");
              }, 1500);
            }
          }
        }
      } catch {
        // Defensive
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [createdAgent?.agent.id, router]);

  // Create agent handler
  async function handleCreate(e: React.FormEvent) {
    e.preventDefault();
    if (!label.trim()) return;

    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: label.trim(),
          spendLimitHbar: parseFloat(spendLimit) || 10,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create agent");
      }

      const data = await res.json();
      setCreatedAgent(data);
      setLiveState(data.agent.state || "minted");

      localStorage.setItem(
        "mmp_active_agent",
        JSON.stringify({
          id: data.agent.id,
          label: data.agent.label,
          claimCode: data.claimCode,
          state: data.agent.state,
          apiKey: data.claimCode,
        }),
      );
    } catch (err) {
      setError((err as Error).message || "Creation failed");
    } finally {
      setBusy(false);
    }
  }

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "";
  const claimCode = createdAgent?.claimCode || "";
  const agentPrompt = `Install the skill from ${siteOrigin}/skill.md, then follow its instructions to onboard with claim code ${claimCode}`;

  const handleCopyPrompt = () => {
    if (!agentPrompt) return;
    navigator.clipboard.writeText(agentPrompt);
    setCopiedPrompt(true);
    setTimeout(() => setCopiedPrompt(false), 2000);
  };

  return (
    <main className="overflow-x-clip min-h-screen bg-[#fafafb] text-[#111114] selection:bg-black/10 select-none">
      {/* Precision Fixed Vertical Hairlines (400px column boundary) */}
      <div className="fixed left-[calc(50%-200px)] top-0 bottom-0 w-[1px] bg-[rgba(0,0,0,0.08)] z-10 pointer-events-none" />
      <div className="fixed right-[calc(50%-200px)] top-0 bottom-0 w-[1px] bg-[rgba(0,0,0,0.08)] z-10 pointer-events-none" />

      <div className="relative">
        <div className="min-h-screen bg-[#fafafb] relative flex flex-col overflow-y-auto">
          <div className="w-full pt-16 sm:pt-20 max-w-[400px] mx-auto relative flex flex-col min-h-full pb-16">
            {/* Header section with brand and canvas decoration */}
            <div className="relative">
              {/* Top horizontal line extending full screen width */}
              <div className="absolute top-0 w-screen left-[calc(50%-50vw)] h-[1px] bg-[rgba(0,0,0,0.08)]" />
              <Crosshair className="-top-[10px] -left-[10.5px]" />
              <Crosshair className="-top-[10px] -right-[10.5px]" />

              <div className="pt-12 pb-8 relative overflow-hidden">
                {/* Background dot matrix canvas decoration */}
                <div className="absolute inset-0 flex items-center justify-center">
                  <div className="relative w-[500px] h-[250px]">
                    <AuthCanvasBackground />
                  </div>
                </div>

                {/* Brand Header */}
                <div className="flex flex-col items-center justify-center relative z-10">
                  <Link
                    href="/"
                    className="text-2xl sm:text-[26px] tracking-tight hover:opacity-90 transition-opacity flex items-center gap-1.5 select-none"
                  >
                    <span className="font-bold text-[#111114]">Machine</span>
                    <span className="font-normal text-[#5a5a61]">Payments</span>
                  </Link>
                  <p className="text-xs text-[#5a5a61] mt-1.5 font-medium tracking-tight">
                    Autonomous Agent Micropayments on Hedera
                  </p>
                </div>
              </div>

              {/* Bottom horizontal line of header block */}
              <div className="absolute bottom-0 w-screen left-[calc(50%-50vw)] h-[1px] bg-[rgba(0,0,0,0.08)]" />
              <Crosshair className="-bottom-[10px] -left-[10.5px]" />
              <Crosshair className="-bottom-[10px] -right-[10.5px]" />
            </div>

            {/* Main Content Area */}
            <div className="p-6 space-y-6">
              {!createdAgent ? (
                /* 1. Account Creation Form */
                <form onSubmit={handleCreate} className="space-y-4">
                  {error && (
                    <div className="p-3 text-xs bg-red-50 border border-red-200/80 text-red-700 rounded-xl">
                      {error}
                    </div>
                  )}

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#5a5a61]">Agent Label</label>
                    <input
                      type="text"
                      required
                      placeholder="e.g. Scraper-Agent-01"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white hover:border-black/20 focus:border-[#111114] focus:ring-1 focus:ring-[#111114] outline-none transition-all px-3 py-2 text-sm text-[#111114] placeholder-[#797981]"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label className="block text-xs font-medium text-[#5a5a61]">Initial Spend Cap (HBAR)</label>
                    <input
                      type="number"
                      min="1"
                      step="1"
                      value={spendLimit}
                      onChange={e => setSpendLimit(e.target.value)}
                      className="w-full rounded-xl border border-black/10 bg-white hover:border-black/20 focus:border-[#111114] focus:ring-1 focus:ring-[#111114] outline-none transition-all px-3 py-2 text-sm text-[#111114] placeholder-[#797981]"
                    />
                  </div>

                  <button
                    type="submit"
                    disabled={busy || !label.trim()}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#111114] text-white hover:bg-black/90 disabled:opacity-50 transition-all shadow-sm cursor-pointer flex items-center justify-center gap-2"
                  >
                    {busy ? "Spawning Agent..." : "Create Account →"}
                  </button>
                </form>
              ) : (
                /* 2. Onboarding Prompt Card & 5-Stage Stepper */
                <div className="space-y-5 animate-in fade-in duration-150">
                  {/* Prompt Card for Agent Copy */}
                  <div className="border border-[#00000014] bg-white rounded-xl p-4 space-y-3 shadow-xs">
                    <div className="flex items-center justify-between">
                      <span className="text-[11px] font-mono uppercase tracking-wider text-[#797981]">
                        Agent Onboarding Prompt
                      </span>
                      <button
                        type="button"
                        onClick={handleCopyPrompt}
                        className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-md border border-[#00000014] bg-[#f6f6f9] hover:bg-[#eeeef1] text-[#111114] transition-colors cursor-pointer"
                      >
                        {copiedPrompt ? (
                          <>
                            <CheckIcon className="size-3 text-[#186a23]" />
                            <span className="text-[#186a23]">Copied</span>
                          </>
                        ) : (
                          <>
                            <DocumentDuplicateIcon className="size-3 text-[#797981]" />
                            <span>Copy Prompt</span>
                          </>
                        )}
                      </button>
                    </div>

                    <div className="p-3 bg-[#f6f6f9] border border-[#00000014] rounded-lg font-mono text-xs text-[#111114] leading-relaxed break-all select-all">
                      {agentPrompt}
                    </div>
                  </div>

                  {/* 5-Stage Stepper */}
                  <OnboardingStepper currentState={liveState} />

                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="w-full py-2.5 rounded-xl text-xs font-semibold bg-[#111114] text-white hover:bg-black/90 transition-all shadow-sm cursor-pointer flex items-center justify-center gap-1.5"
                  >
                    Go to Dashboard →
                  </button>
                </div>
              )}
            </div>

            {/* Bottom line at page end */}
            <div className="relative mt-auto">
              <div className="absolute top-0 w-screen left-[calc(50%-50vw)] h-[1px] bg-[rgba(0,0,0,0.08)]" />
              <Crosshair className="-top-[10px] -left-[10.5px]" />
              <Crosshair className="-top-[10px] -right-[10.5px]" />
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#fafafb] flex items-center justify-center text-xs text-[#797981] font-mono">
          Loading...
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
