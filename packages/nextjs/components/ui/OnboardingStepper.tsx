"use client";

import React from "react";
import { AgentState } from "@/services/agents/types";

interface Props {
  currentState: AgentState | string;
}

const STEPS = [
  { key: "minted", label: "1. Minted", desc: "Claim code created" },
  { key: "initializing", label: "2. Claimed", desc: "Agent claimed credentials" },
  { key: "wallet", label: "3. Wallet Attached", desc: "OWS public key registered" },
  { key: "awaiting_funding", label: "4. Awaiting Deposit", desc: "Funding testnet balance" },
  { key: "active", label: "5. Active", desc: "Ready for machine payments" },
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
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: "1rem",
        padding: "1.25rem",
        backgroundColor: "#0c0c0c",
        borderRadius: "12px",
        border: "1px solid rgba(255, 255, 255, 0.08)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          fontSize: "0.75rem",
          color: "rgba(255, 255, 255, 0.5)",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        <span>Agent Onboarding Stepper</span>
        <span style={{ color: activeIdx === 4 ? "#4ade80" : "#60a5fa", fontFamily: "monospace" }}>
          Step {activeIdx + 1} of 5
        </span>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(5, 1fr)",
          gap: "0.5rem",
          position: "relative",
        }}
      >
        {STEPS.map((step, idx) => {
          const isDone = idx < activeIdx || (idx === 4 && activeIdx === 4);
          const isCurrent = idx === activeIdx && activeIdx < 4;
          const isPending = idx > activeIdx;

          let borderColor = "rgba(255, 255, 255, 0.08)";
          let bgColor = "#111111";
          let textColor = "rgba(255, 255, 255, 0.4)";
          let dotColor = "#333";

          if (isDone) {
            borderColor = "rgba(74, 222, 128, 0.4)";
            bgColor = "rgba(74, 222, 128, 0.06)";
            textColor = "#4ade80";
            dotColor = "#4ade80";
          } else if (isCurrent) {
            borderColor = "rgba(96, 165, 250, 0.5)";
            bgColor = "rgba(96, 165, 250, 0.08)";
            textColor = "#60a5fa";
            dotColor = "#60a5fa";
          }

          return (
            <div
              key={step.key}
              style={{
                display: "flex",
                flexDirection: "column",
                gap: "0.35rem",
                padding: "0.75rem",
                borderRadius: "8px",
                border: `1px solid ${borderColor}`,
                backgroundColor: bgColor,
                transition: "all 200ms ease",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: "0.4rem",
                  fontSize: "0.72rem",
                  fontWeight: 600,
                  color: textColor,
                }}
              >
                <span
                  style={{
                    width: "7px",
                    height: "7px",
                    borderRadius: "50%",
                    backgroundColor: dotColor,
                    boxShadow: isCurrent ? `0 0 8px ${dotColor}` : "none",
                  }}
                />
                {step.label}
              </div>
              <div
                style={{
                  fontSize: "0.66rem",
                  color: isPending ? "rgba(255, 255, 255, 0.25)" : "rgba(255, 255, 255, 0.6)",
                  lineHeight: 1.3,
                }}
              >
                {step.desc}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
