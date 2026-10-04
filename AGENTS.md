# AGENTS.md: Developer & Autonomous Agent Guide

> **Scope Notice:** This document is the operational guide and architectural reference for **AI coding assistants** (e.g. Cursor, Windsurf, Claude Code, Copilot, Antigravity) and **autonomous AI agents** developing, extending, or integrating with applications built on **Scaffold-HBAR Agent & Machine Payments**.

---

## 1. Overview & Core Philosophy

Scaffold-HBAR Agent & Machine Payments provides a turnkey foundation for machine-to-machine micropayments and agentic commerce on Hedera:

- **Seller Monetization:** Scaffold Next.js 14 App Router API endpoints gated by native HBAR micropayments (x402) in one command.
- **Autonomous Agent Onboarding:** Zero-secrets agent onboarding via Open Wallet Standard (OWS) claim codes and dynamic `/skill.md` machine auto-discovery.
- **Agent Trust & Identity:** ERC-8004 on-chain Decentralized Identifiers (DIDs) via `AgentRegistry.sol` on Hedera Smart Contract Service (HSCS).
- **Multi-Tier Spend Governance:** Budget guardrails, atomic holds, consensus spend caps via `Vault.sol` using Hedera Token Service (HTS) precompile `0x167`, and HIP-423 human escalation.
- **Consensus Audit Trails:** Immutable logging of payment decisions, agent identity events, and versioned policies to Hedera Consensus Service (HCS).

When assisting developers in this repository, agents must adhere to the patterns, conventions, and security guardrails detailed below.

---

## 2. Monorepo Architecture & Directory Structure

```
.
├── docs/                         # In-depth architectural & developer documentation
│   ├── getting-started.md        # Quickstart setup & onboarding guide
│   └── architecture.md           # Systems reference, contracts, precompiles & topics
├── packages/
│   ├── hardhat/                  # Hedera smart contracts & deployment infrastructure
│   │   ├── contracts/            # Vault.sol (HTS precompile 0x167), AgentRegistry.sol (ERC-8004)
│   │   ├── deploy/               # Hardhat deployment scripts
│   │   └── test/                 # 100% offline contract unit tests
│   └── nextjs/                   # Next.js 14 App Router application
│       ├── app/                  # App Router pages (/onboard, /dashboard, /verify, /debug)
│       │   ├── api/              # Monetized API endpoints (/api/weather, /api/resource, etc.)
│       │   └── skill.md/         # Dynamic machine auto-discovery endpoint
│       ├── components/           # UI components (SpendDashboard, Onboarding, VerifyAudit)
│       └── services/             # Core service layers
│           ├── facilitator/      # x402 payment challenge negotiation & settlement
│           ├── guard/            # Multi-tier Spend Guard engine & HCS logging
│           └── trust/            # ERC-8004 DID verification & agent identity plugin
├── scripts/                      # Developer CLI utilities
│   ├── makeRoute.ts              # Scaffolds x402-gated App Router endpoints
│   ├── prepare.ts                # Deploys contracts & consensus topics to testnet
│   └── postinstallKeygen.ts      # Zero-config testnet key generation
└── test/                         # Offline integration & unit test suite
```

---

## 3. Core Architectural Mechanisms

### 3.1 Composable Onion Middleware Pipeline

Monetized endpoints compose three decoupled middleware layers wrapping the core business handler:

```typescript
import { NextResponse } from "next/server";
import { withAgentTrust } from "~~/services/trust";
import { withX402 } from "~~/services/facilitator";
import { withSpendGuard } from "~~/services/guard";

// 1 HBAR = 100,000,000 tinybars (10^8)
const PRICE_TINYBAR = "50000000"; // 0.5 HBAR
const PAY_TO = process.env.NEXT_PUBLIC_VAULT_ADDRESS || process.env.AGENT_ACCOUNT_ID || "0.0.X";

const businessHandler = async (req: Request, { payment, guard, agent }: any) => {
  // Business logic executes strictly AFTER payment verification & trust validation
  return NextResponse.json({ success: true, data: { result: "Monetized value delivered" } });
};

export const GET = withAgentTrust(
  withX402(
    withSpendGuard(businessHandler, { maxPriceHbar: 10, recordAudit: true }),
    { priceTinybar: PRICE_TINYBAR, payTo: PAY_TO, memo: "x402-endpoint" }
  )
);
```

#### Layer Execution Order & Responsibilities:

1. **`withAgentTrust` (ERC-8004 Identity & DID Verification):**
   - Validates `X-Agent-DID`, `X-Agent-Signature`, and `X-Agent-Timestamp` headers.
   - Enforces a 5-minute replay protection window.
   - Queries `AgentRegistry.sol` on HSCS to confirm the DID exists, is active, and matches the signing key.
   - Emits an authentication record to the `agent-trust-audit` HCS topic.
   - Injects the authenticated `agent` context downstream.

2. **`withX402` (Payment Challenge & Settlement):**
   - Checks for `PAYMENT-SIGNATURE` HTTP header.
   - **Challenge:** If absent, immediately returns HTTP `402 Payment Required` with a `PAYMENT-REQUIRED` header containing `{ priceTinybar, payTo, network, memo }`.
   - **Verification:** If present, validates and settles the signed `TransferTransaction` via the active facilitator.
   - Injects the verified `payment` receipt downstream.

3. **`withSpendGuard` (Autonomous Financial Governance):**
   - Checks price against per-request (`maxPriceHbar`) and rolling 24-hour limits.
   - Places atomic reservations in memory to prevent race-condition overdrafts.
   - Dispatches consensus-timestamped audit records (`ALLOW`, `BLOCK`, `ESCALATE`) to the `agent-spend-audit` HCS topic.
   - Injects the `guard` context into the inner business handler.

---

### 3.2 Smart Contracts & Native Precompiles

- **`Vault.sol` (`packages/hardhat/contracts/Vault.sol`):**
  - Enforces non-custodial spend ceilings at consensus.
  - Interacts directly with the **Hedera Token Service (HTS) System Contract** at precompile address `0x0000000000000000000000000000000000000167` (`0x167`) to execute low-level `cryptoTransfer` disbursements for native HBAR and HTS tokens.
  - Autonomous transactions exceeding agent daily limits revert in consensus.

- **`AgentRegistry.sol` (`packages/hardhat/contracts/AgentRegistry.sol`):**
  - Implements ERC-8004 on-chain DID identity registries.
  - Maps agent EVM addresses and Hedera account IDs to registered DIDs, service endpoint URLs, and public verification keys.

---

### 3.3 Multi-Tier Spend Guard Ladder

| Level | Name | Execution Target | Behavior |
| --- | --- | --- | --- |
| **L0** | Pre-Flight Checks | App Server Memory | Evaluates counterparty allowlists, blocked tool signatures, and parameter structures before network dispatch. |
| **L1** | Rolling Budgets | App Server Memory | Tracks rolling 24-hour spend against `perDayHbar` limits with atomic holds to prevent concurrent overdrafts. |
| **L2** | Consensus Vault | Hedera HSCS | `Vault.sol` enforces hard on-chain spend ceilings that cannot be bypassed even upon server compromise. |
| **Escalate** | Human Approval | Hedera HSS (HIP-423) | Requests exceeding autonomous limits construct a `ScheduleCreateTransaction`, emit an `ESCALATE` HCS log, and require human approval. |

---

### 3.4 Hedera Consensus Service (HCS) Audit Architecture

Three dedicated HCS topics record the system's operational and trust lifecycle:

1. **`agent-spend-audit` (`NEXT_PUBLIC_SPEND_AUDIT_TOPIC_ID`):**
   - Records real-time payment decisions (`ALLOW`, `BLOCK`, `ESCALATE`), payer/payee account IDs, tinybar amounts, and mirror node transaction IDs.
2. **`agent-trust-audit` (`NEXT_PUBLIC_TRUST_AUDIT_TOPIC_ID`):**
   - Logs agent identity registrations, public key rotations, and DID authentications.
3. **`hcs-2:0:86400` (`NEXT_PUBLIC_POLICY_REGISTRY_TOPIC_ID`):**
   - Standardized HCS-2 versioned policy topic recording merchant spend policies and agent limits.

---

## 4. Key Agent Workflows & How to Implement Them

### 4.1 Scaffolding a New Paid Route (Seller / Merchant)

When instructed to monetize an endpoint or create a paid API:

1. **Run the Route Scaffolder CLI:**
   ```bash
   yarn script:make-route --name <route-name> --price <price-in-hbar> [--trust]
   ```
   *Example:*
   ```bash
   yarn script:make-route --name translation --price 0.25 --trust
   ```
2. **Implement Business Logic:**
   - Locate the generated file at `packages/nextjs/app/api/<route-name>/route.ts`.
   - Replace the sample response in the inner handler with the actual monetization logic.
   - Do **not** remove or bypass the `withAgentTrust`, `withX402`, or `withSpendGuard` wrappers.
3. **Verify Route Manifest:**
   - The CLI automatically updates `packages/nextjs/app/routes-manifest.json`, which instantly exposes the route to autonomous agents via `/skill.md`.

---

### 4.2 Autonomous Agent Onboarding (Identity & Discovery)

When onboarding autonomous AI agents without sharing private keys:

1. **Merchant Portal:**
   - Direct the user/operator to `http://localhost:3000/onboard`.
   - Enter an agent label, set a daily spend cap, and generate a 24-hour one-time claim code.
2. **Machine Auto-Discovery via `/skill.md`:**
   - Autonomous client agents fetch `<origin>/skill.md` out of the box.
   - The dynamic markdown document provides exact onboarding steps, active monetized route tables with tinybar prices, and payment negotiation instructions.
3. **Claiming Allowance (`POST /api/agents/claim`):**
   - The agent creates its local keystore using Open Wallet Standard (`ows wallet create --network testnet`).
   - The agent redeems the claim code by posting `{ claim, walletAddress, accountId, did }`.
   - The server registers the agent and returns a scoped API token (`mmp_live_...`).
4. **Funding Handshake:**
   - The agent detects an `awaiting_funding` state and outputs a message requesting its human operator to fund its Account ID via the official Hedera Portal Faucet (`https://portal.hedera.com/faucet`).

---

### 4.3 Consuming Paid Endpoints via x402 (Buyer / Machine Client)

When configuring or coding an autonomous client agent to consume paid endpoints:

1. **Step 1: Request Protected Resource**
   ```bash
   curl -i http://localhost:3000/api/translation
   ```
   Server responds with:
   ```http
   HTTP/1.1 402 Payment Required
   PAYMENT-REQUIRED: {"priceTinybar":"25000000","payTo":"0.0.10857484","network":"hedera-testnet","memo":"x402-translation"}
   ```

2. **Step 2: Sign Payment Transaction**
   - Parse the `PAYMENT-REQUIRED` JSON header.
   - Build and cryptographically sign a native Hedera `TransferTransaction` transferring `priceTinybar` to `payTo` with the specified `memo`.
   - Serialize the signed transaction bytes to Base64.

3. **Step 3: Submit Payment Header**
   ```bash
   curl -i http://localhost:3000/api/translation \
     -H "PAYMENT-SIGNATURE: <base64-signed-transaction>"
   ```
   The facilitator settles the payment directly into consensus and unlocks the resource payload.

---

### 4.4 Facilitator Operating Modes

The template supports two facilitator modes:

- **Public Testnet Facilitator (`blocky402.com`):**
  - Active by default when running `yarn next:dev`.
  - Ideal for rapid testing without running local facilitator infrastructure.
- **Sovereign Self-Hosted Facilitator:**
  - Start the application with:
    ```bash
    yarn dev:self-hosted
    ```
  - Routes verification and settlement directly through local route handlers (`/api/x402/facilitator/*`).
  - Required for private or enterprise deployments where transaction co-signing must remain within the merchant's custody.

---

## 5. Hedera Technical Conventions & Standards

Agents modifying or writing code in this repository must strictly adhere to Hedera network standards:

### 5.1 Tinybar Arithmetic
- **Conversion:** $1\text{ HBAR} = 100,000,000\text{ tinybar} = 10^8\text{ tinybar}$.
- **Precision:** Never perform floating-point math on HBAR amounts. Store and manipulate tinybars as integer strings (`"100000000"`) or `BigInt` to prevent rounding errors.

### 5.2 Entity Identifiers & Network Addressing
- **Entity Format:** All native Hedera entities follow the shard-realm-num format: `0.0.X` (e.g., `0.0.10857484`).
- **EVM Addresses:** Hexadecimal addresses (`0x...`) map to Hedera entities via the mirror node or Hedera alias mechanism.
- **Testnet Mirror Node:** Query account state and consensus receipts via:
  ```
  https://testnet.mirrornode.hedera.com/api/v1/
  ```

### 5.3 System Precompiles
- Hedera Token Service (HTS): `0x0000000000000000000000000000000000000167` (`0x167`).
- Hedera Schedule Service (HSS): `0x000000000000000000000000000000000000016b` (`0x16b`).

---

## 6. Strict Security & Operational Guardrails (Zero-Tolerance)

AI coding assistants must strictly enforce the following rules when creating or updating files:

1. **Zero Committed Secrets:**
   - **NEVER** commit, stage, or hardcode private keys, operator keys, seed phrases, or `.env` files.
   - Verify that all sensitive environment variables are defined in `.env.local` (which is covered by `.gitignore`).
   - Run `git status` before completing any task to confirm no credentials have leaked.
2. **Non-Custodial Agent Security:**
   - Agent private keys belong exclusively in the agent's local encrypted keystore.
   - Never transmit private keys over HTTP headers, API bodies, or log statements.
3. **100% Offline Unit Tests:**
   - All unit tests in `test/` and `packages/hardhat/test/` must run and pass **completely offline** without requiring live testnet JSON-RPC or funded accounts.
   - Use mocks or local Hardhat network emulation for automated test runs.
4. **Clean Builds (Zero Warnings, Zero Errors):**
   - Code must pass `yarn lint`, `yarn next:check-types`, and `yarn hardhat:check-types` without suppressing errors via `any` or `@ts-ignore` unless strictly justified.

---

## 7. Developer Command Cheat Sheet

| Command | Working Directory | Description |
| --- | --- | --- |
| `yarn script:prepare` | Root | Checks balance, deploys `Vault` + `AgentRegistry`, creates 3 HCS topics |
| `yarn script:make-route` | Root | Scaffolds a new x402-monetized Next.js App Router endpoint |
| `yarn next:dev` | Root | Starts Next.js development server (Public `blocky402.com` mode) |
| `yarn dev:self-hosted` | Root | Starts Next.js development server with self-hosted sovereign facilitator |
| `yarn test` | Root | Runs the complete offline test suite across all services and contracts |
| `yarn lint` | Root | Runs ESLint across both `hardhat` and `nextjs` packages |
| `yarn next:check-types` | Root | Typechecks `packages/nextjs` |
| `yarn hardhat:check-types`| Root | Typechecks `packages/hardhat` |
| `yarn next:build` | Root | Produces production build of the Next.js application |
| `yarn hardhat:compile` | Root | Compiles Solidity contracts and generates TypeChain artifacts |

---

## 8. Summary of Application Routes for Developers

- **`/onboard`** — Agent Onboarding Portal (Generate claim links, configure initial allowances).
- **`/skill.md`** — Dynamic machine auto-discovery endpoint for autonomous AI agents.
- **`/dashboard`** — Agent Spend Dashboard (Real-time mirror node polling, spend KPIs, HashScan receipts, budget escalation).
- **`/verify`** — HCS Consensus Audit Trail Explorer (Live verification of spend, trust, and policy records via public Mirror Node).
- **`/debug`** — Contract Debugger (Inspect deployed `Vault.sol` and `AgentRegistry.sol` states and invoke methods).
- **`/api/*`** — Monetized x402 resource endpoints.
