"use client";

import React from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";

export function DevSellerTools() {
  const pathname = usePathname();
  const isDev = process.env.NODE_ENV === "development";

  // Only appear in development mode
  if (!isDev) {
    return null;
  }

  return (
    <aside
      aria-label="Development Seller Tools"
      className="fixed bottom-3 inset-x-4 sm:inset-x-6 z-40 pointer-events-none flex items-center justify-between text-xs select-none"
    >
      {/* Bottom Left: Navigation back home if not on / */}
      <div className="pointer-events-auto">
        {pathname !== "/" && (
          <Link
            href="/"
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-xs border border-[#00000014] text-[#797981] hover:text-[#111114] shadow-xs font-medium transition-colors"
          >
            ← Back
          </Link>
        )}
      </div>

      {/* Bottom Right: Seller Tools (only appears in dev mode) */}
      <div className="pointer-events-auto ml-auto flex items-center gap-2.5 px-3 py-1.5 rounded-lg bg-white/95 backdrop-blur-xs border border-[#00000014] shadow-xs text-[11px] text-[#797981]">
        <span>Seller Tools (only appears in dev mode)</span>
        <Link
          href="/verify"
          className={`font-mono transition-colors ${
            pathname.startsWith("/verify")
              ? "text-[#111114] font-semibold underline"
              : "text-[#111114] hover:text-[#005fad] hover:underline"
          }`}
        >
          Verify
        </Link>
        <span>•</span>
        <Link
          href="/debug"
          className={`font-mono transition-colors ${
            pathname.startsWith("/debug")
              ? "text-[#111114] font-semibold underline"
              : "text-[#111114] hover:text-[#005fad] hover:underline"
          }`}
        >
          Debug
        </Link>
      </div>
    </aside>
  );
}
