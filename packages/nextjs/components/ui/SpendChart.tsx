"use client";

import React, { useMemo } from "react";

export interface ChartBucket {
  date: string;
  spendHbar: number;
  count: number;
}

interface Props {
  data: ChartBucket[];
  height?: number;
}

export function SpendChart({ data, height = 180 }: Props) {
  const { path, areaPath, max, points } = useMemo(() => {
    if (!data || data.length === 0) {
      return { path: "", areaPath: "", max: 0, points: [] };
    }
    const max = Math.max(...data.map(d => d.spendHbar), 0.1);
    const w = 1000;
    const h = 100;
    const step = data.length > 1 ? w / (data.length - 1) : 0;
    const points = data.map((b, i) => ({
      x: i * step,
      y: h - (b.spendHbar / max) * h,
      b,
    }));
    const path = points.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ");
    const last = points[points.length - 1]!;
    const areaPath = `${path} L${last.x.toFixed(1)},${h} L0,${h} Z`;
    return { path, areaPath, max, points };
  }, [data]);

  if (!data || data.length === 0 || max === 0) {
    return (
      <div
        style={{
          height,
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          color: "rgba(255, 255, 255, 0.4)",
          fontSize: "0.8rem",
          backgroundColor: "#0c0c0c",
          borderRadius: "12px",
          border: "1px solid rgba(255, 255, 255, 0.08)",
        }}
      >
        No spend transactions recorded yet
      </div>
    );
  }

  const labelStride = Math.max(1, Math.floor(data.length / 6));

  return (
    <div
      style={{
        width: "100%",
        padding: "1.25rem",
        borderRadius: "12px",
        backgroundColor: "#0c0c0c",
        border: "1px solid rgba(255, 255, 255, 0.08)",
        display: "flex",
        flexDirection: "column",
        gap: "0.75rem",
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
        <span>Daily Spend Volume (14 Days)</span>
        <span style={{ color: "#4ade80", fontFamily: "monospace" }}>Peak: {max.toFixed(2)} HBAR</span>
      </div>

      <svg viewBox="0 0 1000 120" preserveAspectRatio="none" style={{ width: "100%", height, display: "block" }}>
        <defs>
          <linearGradient id="spendFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#4ade80" stopOpacity="0.25" />
            <stop offset="100%" stopColor="#4ade80" stopOpacity="0" />
          </linearGradient>
        </defs>

        {[0, 25, 50, 75, 100].map(y => (
          <line
            key={y}
            x1={0}
            x2={1000}
            y1={y}
            y2={y}
            stroke="rgba(255, 255, 255, 0.08)"
            strokeDasharray="2 4"
            strokeWidth={0.5}
          />
        ))}

        <path d={areaPath} fill="url(#spendFill)" />
        <path d={path} stroke="#4ade80" strokeWidth={2} fill="none" />

        {points.map((p, i) => (
          <circle
            key={i}
            cx={p.x}
            cy={p.y}
            r={p.b.spendHbar > 0 ? 3.5 : 1.5}
            fill="#4ade80"
            opacity={p.b.spendHbar > 0 ? 1 : 0.4}
          />
        ))}
      </svg>

      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontSize: "0.68rem",
          color: "rgba(255, 255, 255, 0.4)",
          fontFamily: "monospace",
        }}
      >
        {data.map((b, i) => (i % labelStride === 0 ? <span key={b.date}>{b.date}</span> : <span key={b.date} />))}
      </div>
    </div>
  );
}
