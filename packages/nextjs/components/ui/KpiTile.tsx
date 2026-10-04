"use client";

import React, { ReactNode } from "react";

interface KpiTileProps {
  label: string;
  value: string | number;
  hint?: string;
  icon?: ReactNode;
}

export function KpiTile({ label, value, hint, icon }: KpiTileProps) {
  return (
    <div
      style={{
        flex: 1,
        minWidth: "200px",
        padding: "1.25rem",
        borderRadius: "12px",
        backgroundColor: "#0c0c0c",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "0.4rem",
        position: "relative",
        overflow: "hidden",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          color: "rgba(255, 255, 255, 0.5)",
          fontSize: "0.75rem",
          textTransform: "uppercase",
          letterSpacing: "0.06em",
          fontWeight: 600,
        }}
      >
        <span>{label}</span>
        {icon && <span style={{ opacity: 0.7 }}>{icon}</span>}
      </div>

      <div
        style={{
          fontSize: "1.75rem",
          fontWeight: 700,
          fontFamily: "monospace",
          color: "#f4f4f4",
          letterSpacing: "-0.02em",
        }}
      >
        {value}
      </div>

      {hint && (
        <div
          style={{
            fontSize: "0.75rem",
            color: "rgba(255, 255, 255, 0.4)",
          }}
        >
          {hint}
        </div>
      )}
    </div>
  );
}

export function KpiRow({ children }: { children: ReactNode }) {
  return (
    <div
      style={{
        display: "flex",
        flexWrap: "wrap",
        gap: "1rem",
        width: "100%",
      }}
    >
      {children}
    </div>
  );
}
