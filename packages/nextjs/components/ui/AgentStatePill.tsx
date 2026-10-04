"use client";

import React from "react";
import { AgentState } from "@/services/agents/types";

interface Props {
  state: AgentState | string;
}

const CONFIG: Record<string, { label: string; bg: string; text: string; border: string; dot: string }> = {
  active: {
    label: "Active",
    bg: "rgba(34, 197, 94, 0.1)",
    text: "#4ade80",
    border: "rgba(34, 197, 94, 0.3)",
    dot: "#22c55e",
  },
  funded: {
    label: "Funded",
    bg: "rgba(168, 85, 247, 0.1)",
    text: "#c084fc",
    border: "rgba(168, 85, 247, 0.3)",
    dot: "#a855f7",
  },
  awaiting_funding: {
    label: "Awaiting deposit",
    bg: "rgba(234, 179, 8, 0.1)",
    text: "#facc15",
    border: "rgba(234, 179, 8, 0.3)",
    dot: "#eab308",
  },
  wallet: {
    label: "Wallet registered",
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#60a5fa",
    border: "rgba(59, 130, 246, 0.3)",
    dot: "#3b82f6",
  },
  initializing: {
    label: "Claimed",
    bg: "rgba(59, 130, 246, 0.1)",
    text: "#60a5fa",
    border: "rgba(59, 130, 246, 0.3)",
    dot: "#3b82f6",
  },
  minted: {
    label: "Minted",
    bg: "rgba(148, 163, 184, 0.1)",
    text: "#94a3b8",
    border: "rgba(148, 163, 184, 0.3)",
    dot: "#64748b",
  },
};

export function AgentStatePill({ state }: Props) {
  const conf = CONFIG[state] || CONFIG.minted;

  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: "0.4rem",
        padding: "0.2rem 0.55rem",
        borderRadius: "9999px",
        fontSize: "0.72rem",
        fontWeight: 600,
        fontFamily: "monospace",
        background: conf.bg,
        color: conf.text,
        border: `1px solid ${conf.border}`,
        whiteSpace: "nowrap",
      }}
    >
      <span
        style={{
          width: "6px",
          height: "6px",
          borderRadius: "50%",
          backgroundColor: conf.dot,
          boxShadow: `0 0 6px ${conf.dot}`,
        }}
      />
      {conf.label}
    </span>
  );
}
