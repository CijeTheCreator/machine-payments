"use client";

import React from "react";
import { AgentState } from "@/services/agents/types";
import { CheckIcon } from "@heroicons/react/24/outline";

interface Props {
  currentState: AgentState | string;
}

const STEPS = [
  { key: "minted", label: "Minted", desc: "Claim code generated" },
  { key: "initializing", label: "Claimed", desc: "Agent claimed credentials" },
  { key: "wallet", label: "Wallet Attached", desc: "OWS keys registered" },
  { key: "awaiting_funding", label: "Awaiting Deposit", desc: "Funding testnet balance" },
  { key: "active", label: "Active", desc: "Ready for machine payments" },
];

function getStepIndex(state: string): number {
  switch (state) {
    case "minted":
      return 0;
    case "initializing":
      return 1;
    case "wallet":
      return 2;
    case "awaiting_funding":
      return 3;
    case "funded":
    case "active":
      return 4;
    default:
      return 0;
  }
}

export function OnboardingStepper({ currentState }: Props) {
  const activeIdx = getStepIndex(currentState);

  return (
    <div className="border border-[#00000014] bg-white rounded-xl p-4 space-y-3 shadow-xs">
      <div className="flex justify-between items-center text-[11px] font-mono uppercase tracking-wider text-[#797981]">
        <span>Lifecycle Status</span>
        <span className={activeIdx === 4 ? "text-[#186a23] font-semibold" : "text-[#005fad] font-semibold"}>
          Step {activeIdx + 1} of 5
        </span>
      </div>

      <div className="space-y-2.5">
        {STEPS.map((step, idx) => {
          const isDone = idx < activeIdx || (idx === 4 && activeIdx === 4);
          const isCurrent = idx === activeIdx && activeIdx < 4;

          return (
            <div
              key={step.key}
              className={`flex items-start gap-3 p-2 rounded-lg transition-colors ${
                isCurrent ? "bg-[#f6f6f9] border border-[#00000014]" : "bg-transparent"
              }`}
            >
              {/* Step indicator circle */}
              <div className="mt-0.5 shrink-0">
                {isDone ? (
                  <div className="size-4 rounded-full bg-[#186a23] text-white flex items-center justify-center">
                    <CheckIcon className="size-2.5 stroke-[3]" />
                  </div>
                ) : isCurrent ? (
                  <div className="size-4 rounded-full border-2 border-[#005fad] flex items-center justify-center">
                    <div className="size-1.5 rounded-full bg-[#005fad] animate-pulse" />
                  </div>
                ) : (
                  <div className="size-4 rounded-full border border-black/20 bg-white" />
                )}
              </div>

              {/* Step content */}
              <div className="min-w-0 flex-1">
                <div
                  className={`text-xs font-semibold leading-tight ${
                    isDone ? "text-[#186a23]" : isCurrent ? "text-[#111114]" : "text-[#797981]"
                  }`}
                >
                  {step.label}
                </div>
                <div className="text-[11px] text-[#797981] mt-0.5 leading-tight">{step.desc}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
