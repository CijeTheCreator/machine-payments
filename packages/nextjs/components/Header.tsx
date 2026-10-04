"use client";

import React, { useEffect, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  ArrowRightOnRectangleIcon,
  Bars3Icon,
  BugAntIcon,
  ChartBarIcon,
  CommandLineIcon,
  ShieldCheckIcon,
  UserPlusIcon,
} from "@heroicons/react/24/outline";
import { useOutsideClick } from "~~/hooks/scaffold-hbar";

export const Header = () => {
  const pathname = usePathname();
  const router = useRouter();
  const burgerMenuRef = useRef<HTMLDetailsElement>(null);
  const devMenuRef = useRef<HTMLDetailsElement>(null);

  const [activeAgentLabel, setActiveAgentLabel] = useState<string | null>(null);

  useEffect(() => {
    const updateActiveAgent = () => {
      try {
        const stored = localStorage.getItem("mmp_active_agent");
        if (stored) {
          const parsed = JSON.parse(stored);
          setActiveAgentLabel(parsed?.label || parsed?.id || "Active Agent");
        } else {
          setActiveAgentLabel(null);
        }
      } catch {
        setActiveAgentLabel(null);
      }
    };

    updateActiveAgent();
    window.addEventListener("storage", updateActiveAgent);
    const interval = setInterval(updateActiveAgent, 2000);
    return () => {
      window.removeEventListener("storage", updateActiveAgent);
      clearInterval(interval);
    };
  }, []);

  const handleSignOut = () => {
    localStorage.removeItem("mmp_active_agent");
    setActiveAgentLabel(null);
    router.push("/onboarding");
  };

  useOutsideClick(burgerMenuRef, () => {
    burgerMenuRef?.current?.removeAttribute("open");
  });
  useOutsideClick(devMenuRef, () => {
    devMenuRef?.current?.removeAttribute("open");
  });

  const isDev = process.env.NODE_ENV === "development";

  return (
    <div className="sticky top-0 navbar bg-[#0a0a0a] min-h-0 shrink-0 justify-between z-30 border-b border-white/10 px-3 sm:px-6">
      <div className="navbar-start w-auto flex items-center gap-4">
        {/* Mobile menu dropdown */}
        <details className="dropdown lg:hidden" ref={burgerMenuRef}>
          <summary className="btn btn-ghost btn-sm px-2 text-white">
            <Bars3Icon className="h-5 w-5" />
          </summary>
          <ul
            className="menu menu-compact dropdown-content mt-2 p-2 shadow-lg bg-[#141414] border border-white/10 rounded-xl w-52 text-white"
            onClick={() => burgerMenuRef?.current?.removeAttribute("open")}
          >
            <li>
              <Link href="/" className={pathname === "/" ? "font-bold text-[#4ade80]" : ""}>
                <ChartBarIcon className="w-4 h-4" /> Agent Dashboard
              </Link>
            </li>
            <li>
              <Link href="/onboarding" className={pathname === "/onboarding" ? "font-bold text-[#4ade80]" : ""}>
                <UserPlusIcon className="w-4 h-4" /> Onboarding
              </Link>
            </li>
            {isDev && (
              <>
                <li className="menu-title text-white/40 uppercase text-[10px] mt-2 font-mono">Dev Tools</li>
                <li>
                  <Link href="/verify">
                    <ShieldCheckIcon className="w-4 h-4" /> Verify (HCS-2)
                  </Link>
                </li>
                <li>
                  <Link href="/debug">
                    <BugAntIcon className="w-4 h-4" /> Contract Debugger
                  </Link>
                </li>
              </>
            )}
          </ul>
        </details>

        {/* Brand */}
        <Link href="/" className="flex items-center gap-2.5 shrink-0 text-decoration-none">
          <div className="flex relative w-7 h-7">
            <Image alt="Hedera icon" className="cursor-pointer" fill src="/Hedera-Icon-White.svg" />
          </div>
          <div className="flex flex-col">
            <span className="font-bold text-sm tracking-tight text-white leading-none">Agent Payments</span>
            <span className="text-[10px] tracking-wider uppercase text-white/40 font-mono mt-0.5">
              Open Wallet Standard
            </span>
          </div>
        </Link>

        {/* Desktop Links */}
        <ul className="hidden lg:flex menu menu-horizontal px-1 gap-1 ml-4">
          <li>
            <Link
              href="/"
              className={`py-1.5 px-3 text-xs font-mono rounded-lg transition-colors ${
                pathname === "/" ? "bg-white/10 text-white font-semibold" : "text-white/60 hover:text-white"
              }`}
            >
              <ChartBarIcon className="h-3.5 w-3.5 inline mr-1.5" />
              Agent Dashboard
            </Link>
          </li>
          <li>
            <Link
              href="/onboarding"
              className={`py-1.5 px-3 text-xs font-mono rounded-lg transition-colors ${
                pathname === "/onboarding" ? "bg-white/10 text-white font-semibold" : "text-white/60 hover:text-white"
              }`}
            >
              <UserPlusIcon className="h-3.5 w-3.5 inline mr-1.5" />
              Onboarding
            </Link>
          </li>
        </ul>
      </div>

      <div className="navbar-end w-auto flex items-center gap-3">
        {/* Active Agent Badge (if onboarded) */}
        {activeAgentLabel ? (
          <div className="flex items-center gap-2 bg-[#141414] border border-white/10 rounded-lg px-2.5 py-1 text-xs font-mono">
            <span className="w-2 h-2 rounded-full bg-[#4ade80] animate-pulse" />
            <span className="text-white font-medium max-w-[140px] truncate">{activeAgentLabel}</span>
            <button
              onClick={handleSignOut}
              title="Sign out / switch agent"
              className="text-white/40 hover:text-white transition-colors ml-1"
            >
              <ArrowRightOnRectangleIcon className="w-3.5 h-3.5" />
            </button>
          </div>
        ) : (
          <Link
            href="/onboarding"
            className="text-xs font-mono text-white/40 hover:text-white/80 transition-colors hidden sm:inline"
          >
            Not Onboarded
          </Link>
        )}

        {/* Dev Tools Dropdown (Visible during development only) */}
        {isDev && (
          <details className="dropdown dropdown-end" ref={devMenuRef}>
            <summary className="btn btn-ghost btn-xs text-white/50 hover:text-white font-mono uppercase tracking-wider text-[10px] border border-white/10 bg-[#111111] px-2 py-1">
              <CommandLineIcon className="w-3 h-3 inline mr-1" />
              Dev Tools
            </summary>
            <ul
              className="menu menu-compact dropdown-content mt-2 p-2 shadow-xl bg-[#141414] border border-white/10 rounded-xl w-48 text-white text-xs font-mono z-50"
              onClick={() => devMenuRef?.current?.removeAttribute("open")}
            >
              <li className="menu-title text-white/40 uppercase text-[9px]">Scaffold Debuggers</li>
              <li>
                <Link href="/verify" className="flex items-center gap-2 py-2">
                  <ShieldCheckIcon className="w-4 h-4 text-[#60a5fa]" /> HCS-2 Policy Audit
                </Link>
              </li>
              <li>
                <Link href="/debug" className="flex items-center gap-2 py-2">
                  <BugAntIcon className="w-4 h-4 text-[#facc15]" /> Contract Debugger
                </Link>
              </li>
            </ul>
          </details>
        )}
      </div>
    </div>
  );
};
