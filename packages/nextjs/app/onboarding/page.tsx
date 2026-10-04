"use client";

import React, { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { AgentStatePill } from "@/components/ui/AgentStatePill";
import { OnboardingStepper } from "@/components/ui/OnboardingStepper";
import { AgentRecord } from "@/services/agents/types";
import {
  ArrowRightIcon,
  CheckIcon,
  ClipboardDocumentIcon,
  ExclamationCircleIcon,
  KeyIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";

function OnboardingContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const notOnboardedNotice = searchParams.get("error") === "not_onboarded";
  const forceNew = searchParams.get("new") === "1";

  const [activeTab, setActiveTab] = useState<"create" | "login">("create");
  const [label, setLabel] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdAgent, setCreatedAgent] = useState<{
    claimCode: string;
    agent: AgentRecord;
  } | null>(null);

  const [liveAgent, setLiveAgent] = useState<AgentRecord | null>(null);
  const [copiedCode, setCopiedCode] = useState(false);
  const [copiedSnippet, setCopiedSnippet] = useState(false);

  // Portal login state
  const [loginApiKey, setLoginApiKey] = useState("");
  const [loginBusy, setLoginBusy] = useState(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [authenticatedAgent, setAuthenticatedAgent] = useState<{
    agent: AgentRecord;
    balance?: { hbar: string; tinybar: string };
  } | null>(null);

  // If already onboarded and funded, immediately route to dashboard on load / refresh
  useEffect(() => {
    if (forceNew) return;
    try {
      const stored = localStorage.getItem("mmp_active_agent");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed?.id) {
          if (parsed?.state === "funded" || parsed?.state === "active" || parsed?.apiKey) {
            router.replace("/");
            return;
          }
          // Check backend in case funding occurred externally
          fetch(`/api/agents/${parsed.id}`)
            .then(res => (res.ok ? res.json() : null))
            .then(data => {
              if (data?.agent && (data.agent.state === "funded" || data.agent.state === "active")) {
                localStorage.setItem(
                  "mmp_active_agent",
                  JSON.stringify({
                    ...parsed,
                    ...data.agent,
                  }),
                );
                router.replace("/");
              }
            })
            .catch(() => {});
        }
      }
    } catch {
      // Defensive
    }
  }, [router, forceNew]);

  // Handle agent creation
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
          spendLimitHbar: 10,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Failed to create agent");
      }

      const data = await res.json();
      setCreatedAgent(data);
      setLiveAgent(data.agent);

      // Store in session so user has active agent context
      localStorage.setItem(
        "mmp_active_agent",
        JSON.stringify({
          id: data.agent.id,
          label: data.agent.label,
          claimCode: data.claimCode,
          state: data.agent.state,
        }),
      );
    } catch (err) {
      setError((err as Error).message || "Creation failed");
    } finally {
      setBusy(false);
    }
  }

  // Poll live agent state if a claim code has been minted
  useEffect(() => {
    if (!createdAgent?.agent.id) return;
    const agentId = createdAgent.agent.id;

    const interval = setInterval(async () => {
      try {
        const res = await fetch(`/api/agents/${agentId}`);
        if (res.ok) {
          const data = await res.json();
          if (data.agent) {
            setLiveAgent(data.agent);
            // Update stored session with latest wallet / account data
            const existing = localStorage.getItem("mmp_active_agent");
            const parsed = existing ? JSON.parse(existing) : {};
            localStorage.setItem(
              "mmp_active_agent",
              JSON.stringify({
                ...parsed,
                ...data.agent,
              }),
            );

            // Auto-advance to dashboard once funded or active
            if (data.agent.state === "funded" || data.agent.state === "active") {
              setTimeout(() => {
                router.push("/");
              }, 1200);
            }
          }
        }
      } catch {
        // Defensive
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [createdAgent?.agent.id, router]);

  // Handle portal login with API key
  async function handleLogin(e: React.FormEvent) {
    e.preventDefault();
    if (!loginApiKey.trim()) return;

    setLoginBusy(true);
    setLoginError(null);
    try {
      const res = await fetch("/api/auth/agent-login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey: loginApiKey.trim() }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || "Invalid API key");
      }

      const data = await res.json();
      setAuthenticatedAgent(data);

      // Save authenticated agent in session for dashboard access
      localStorage.setItem(
        "mmp_active_agent",
        JSON.stringify({
          ...data.agent,
          apiKey: loginApiKey.trim(),
        }),
      );

      // Auto-navigate to dashboard
      router.push("/");
    } catch (err) {
      setLoginError((err as Error).message || "Login failed");
    } finally {
      setLoginBusy(false);
    }
  }

  const siteOrigin = typeof window !== "undefined" ? window.location.origin : "http://localhost:3000";
  const claimCode = createdAgent?.claimCode || "";
  const agentInstruction = `Install the skill from ${siteOrigin}/skill.md and set up this agent by running:
curl -X POST "${siteOrigin}/api/agents/claim" \\
  -H "Content-Type: application/json" \\
  -d '{
    "claim": "${claimCode}",
    "walletAddress": "<YOUR_OWS_ADDRESS>",
    "accountId": "<YOUR_ACCOUNT_ID>",
    "did": "did:hedera:testnet:<YOUR_ACCOUNT_ID>"
  }'`;

  return (
    <div className="min-h-screen bg-[#050505] text-[#f4f4f4] py-10 px-4 sm:px-6 lg:px-8">
      <div className="max-w-4xl mx-auto flex flex-col gap-8">
        {/* Not Onboarded Alert Banner (if redirected from dashboard) */}
        {notOnboardedNotice && (
          <div className="flex items-center gap-3 p-4 bg-yellow-500/10 border border-yellow-500/20 rounded-xl text-yellow-300 text-xs font-mono">
            <ExclamationCircleIcon className="w-5 h-5 shrink-0 text-yellow-400" />
            <span>Please onboard an agent or sign in with your API key to access your spend dashboard.</span>
          </div>
        )}

        {/* Header Hero */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-white/10 pb-6">
          <div>
            <div className="flex items-center gap-2 text-[#4ade80] text-xs uppercase font-mono tracking-widest mb-1">
              <span>●</span> Machine-to-Machine Payments
            </div>
            <h1 className="text-3xl font-bold tracking-tight text-white">Agent Onboarding</h1>
            <p className="text-sm text-white/50 mt-1 max-w-xl">
              Onboard your AI agent using the Open Wallet Standard (OWS). Mint claim credentials, register your Hedera
              account, and track spend.
            </p>
          </div>

          <div className="flex items-center gap-2 bg-[#0c0c0c] border border-white/10 rounded-lg p-1 self-start sm:self-auto">
            <button
              onClick={() => setActiveTab("create")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "create" ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              <UserPlusIcon className="w-3.5 h-3.5" />
              Mint Agent
            </button>
            <button
              onClick={() => setActiveTab("login")}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors ${
                activeTab === "login" ? "bg-white/10 text-white" : "text-white/50 hover:text-white"
              }`}
            >
              <KeyIcon className="w-3.5 h-3.5" />
              Agent Portal
            </button>
          </div>
        </div>

        {/* Tab 1: Create Agent Flow */}
        {activeTab === "create" && (
          <div className="flex flex-col gap-6">
            {!createdAgent ? (
              <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col gap-6">
                <div>
                  <h2 className="text-lg font-semibold text-white">Provision New Client Agent</h2>
                  <p className="text-xs text-white/50 mt-1">
                    Assign a label to mint a single-use claim code. Your agent will trade this code via HTTP REST for
                    its permanent API key.
                  </p>
                </div>

                {error && (
                  <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                    {error}
                  </div>
                )}

                <form onSubmit={handleCreate} className="flex flex-col gap-4 max-w-md">
                  <div>
                    <label className="block text-xs uppercase tracking-wider text-white/50 font-mono mb-1.5">
                      Agent Label *
                    </label>
                    <input
                      type="text"
                      placeholder="e.g. market-analyzer-bot"
                      value={label}
                      onChange={e => setLabel(e.target.value)}
                      required
                      className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white placeholder-white/20 focus:outline-none focus:border-[#4ade80]"
                    />
                    <div className="text-[11px] text-white/40 font-mono mt-1.5">
                      Default spending safety limit: 10 HBAR
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={busy || !label.trim()}
                    className="mt-2 w-full flex items-center justify-center gap-2 bg-[#4ade80] hover:bg-[#22c55e] disabled:opacity-50 text-black font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
                  >
                    {busy ? "Minting Claim Code…" : "Mint Claim Code"}
                  </button>
                </form>
              </div>
            ) : (
              <div className="flex flex-col gap-6">
                {/* 5-Step Stepper */}
                <OnboardingStepper currentState={liveAgent?.state || "minted"} />

                {/* Claim Details Card */}
                <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-6 flex flex-col gap-5">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 border-b border-white/10 pb-4">
                    <div>
                      <div className="text-xs text-white/40 uppercase font-mono">Agent Initialized</div>
                      <div className="text-xl font-bold text-white flex items-center gap-2 mt-0.5">
                        {liveAgent?.label}
                        <AgentStatePill state={liveAgent?.state || "minted"} />
                      </div>
                    </div>

                    <Link
                      href="/"
                      className="flex items-center gap-1.5 bg-[#4ade80] hover:bg-[#22c55e] text-black font-semibold py-1.5 px-3 rounded-lg text-xs font-mono self-start sm:self-auto transition-colors"
                    >
                      Go to Dashboard <ArrowRightIcon className="w-3.5 h-3.5" />
                    </Link>
                  </div>

                  {/* One-time claim code */}
                  <div>
                    <div className="text-xs text-white/50 font-mono uppercase mb-1">One-Time Claim Code</div>
                    <div className="flex items-center gap-2">
                      <code className="bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm font-mono text-[#60a5fa] flex-1 select-all overflow-x-auto">
                        {claimCode}
                      </code>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(claimCode);
                          setCopiedCode(true);
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        className="px-3 py-2 bg-white/10 hover:bg-white/15 rounded-lg text-xs font-mono text-white flex items-center gap-1.5"
                      >
                        {copiedCode ? (
                          <CheckIcon className="w-4 h-4 text-green-400" />
                        ) : (
                          <ClipboardDocumentIcon className="w-4 h-4" />
                        )}
                        {copiedCode ? "Copied" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* OWS Execution Instructions */}
                  <div className="flex flex-col gap-2">
                    <div className="text-xs text-white/50 font-mono uppercase">
                      Agent Setup Prompt (Paste into your Agent Chat)
                    </div>
                    <div className="relative">
                      <pre className="bg-[#111111] border border-white/10 rounded-lg p-4 text-xs font-mono text-white/80 overflow-x-auto leading-relaxed whitespace-pre-wrap">
                        {agentInstruction}
                      </pre>
                      <button
                        onClick={async () => {
                          await navigator.clipboard.writeText(agentInstruction);
                          setCopiedSnippet(true);
                          setTimeout(() => setCopiedSnippet(false), 2000);
                        }}
                        className="absolute top-3 right-3 px-2.5 py-1 bg-white/10 hover:bg-white/20 rounded text-[11px] font-mono text-white flex items-center gap-1"
                      >
                        {copiedSnippet ? (
                          <CheckIcon className="w-3.5 h-3.5 text-green-400" />
                        ) : (
                          <ClipboardDocumentIcon className="w-3.5 h-3.5" />
                        )}
                        {copiedSnippet ? "Copied" : "Copy Prompt"}
                      </button>
                    </div>
                  </div>

                  {/* Reset action */}
                  <div className="pt-2 flex justify-between items-center border-t border-white/5">
                    <span className="text-xs text-white/40 font-mono">
                      Once claimed and funded, you will be taken to your dashboard automatically.
                    </span>
                    <button
                      onClick={() => {
                        setCreatedAgent(null);
                        setLiveAgent(null);
                        setLabel("");
                      }}
                      className="text-xs text-white/40 hover:text-white underline font-mono"
                    >
                      + Provision Another Agent
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Tab 2: Agent Self-Service Portal Login */}
        {activeTab === "login" && (
          <div className="bg-[#0c0c0c] border border-white/10 rounded-xl p-6 sm:p-8 flex flex-col gap-6">
            <div>
              <h2 className="text-lg font-semibold text-white">Agent Portal Access</h2>
              <p className="text-xs text-white/50 mt-1">
                Authenticate using your agent&apos;s bearer API key (mmp_live_...) to access spend telemetry.
              </p>
            </div>

            {loginError && (
              <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-lg text-red-400 text-xs">
                {loginError}
              </div>
            )}

            <form onSubmit={handleLogin} className="flex flex-col gap-4 max-w-md">
              <div>
                <label className="block text-xs uppercase tracking-wider text-white/50 font-mono mb-1.5">
                  Agent API Key *
                </label>
                <input
                  type="password"
                  placeholder="mmp_live_..."
                  value={loginApiKey}
                  onChange={e => setLoginApiKey(e.target.value)}
                  required
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-sm text-white font-mono placeholder-white/20 focus:outline-none focus:border-[#4ade80]"
                />
              </div>

              <button
                type="submit"
                disabled={loginBusy || !loginApiKey.trim()}
                className="mt-2 w-full flex items-center justify-center gap-2 bg-[#4ade80] hover:bg-[#22c55e] disabled:opacity-50 text-black font-semibold py-2.5 px-4 rounded-lg text-sm transition-colors"
              >
                {loginBusy ? "Authenticating…" : "Sign In with API Key"}
              </button>
            </form>

            {authenticatedAgent && (
              <div className="mt-4 p-4 bg-[#141414] border border-green-500/20 rounded-xl flex flex-col gap-2">
                <div className="text-xs text-green-400 font-mono flex items-center gap-2">
                  <CheckIcon className="w-4 h-4" /> Authenticated successfully as {authenticatedAgent.agent.label}
                </div>
                <div className="text-xs text-white/50 font-mono">
                  Wallet: {authenticatedAgent.agent.walletAddress || "None"} (Account:{" "}
                  {authenticatedAgent.agent.accountId || "None"})
                </div>
                <Link
                  href="/"
                  className="mt-2 inline-flex items-center gap-1.5 text-xs text-[#4ade80] hover:underline font-mono"
                >
                  Proceed to Spend Dashboard →
                </Link>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-[#050505] flex items-center justify-center text-white/50 font-mono text-sm">
          Loading onboarding…
        </div>
      }
    >
      <OnboardingContent />
    </Suspense>
  );
}
