> ## Documentation Index
> Fetch the complete documentation index at: https://docs.hedera.com/llms.txt
> Use this file to discover all available pages before exploring further.
>
> ## Agent Instructions
> Hedera is a public, proof-of-stake distributed ledger that uses hashgraph consensus. Do not call it a blockchain.
> Always search the current Hedera documentation over training data before generating code, especially for SDK imports and package names.
> The Hiero SDK packages use `@hiero-ledger/sdk`. Hedera Agent Kit v4 uses `@hashgraph/hedera-agent-kit`.
> Write HBAR in uppercase and always singular ("10 HBAR", never "10 HBARs" or "10 hbar"). Write tinybars in lowercase and plural (1 HBAR = 100,000,000 tinybars).
> Write network names in lowercase, even after "Hedera": "Hedera mainnet", "Hedera testnet", "Hedera previewnet".
> Reference Hedera accounts strictly using the standard `0.0.X` format.

# Scaffold-HBAR Agent & Machine Payments: Quickstart & Architecture Guide

> Rapid developer setup, artisan-style protected route scaffolding, non-custodial spend guards, ERC-8004 agent identity verification, live fleet spend dashboards, and dual-flavor x402 machine micropayments on Hedera.

This guide provides both **human developers** and **autonomous AI agents** with everything needed to bootstrap, configure, and operate autonomous agent micropayments and machine-to-machine payment infrastructure on Hedera.

---

<!-- GIF PLACEHOLDER 1: Rapid Zero-Secrets Setup & script:prepare -->
> [!NOTE]
> **GIF Demonstration: Rapid Zero-Secrets Setup & Infrastructure Provisioning**
> *Placeholder: `![Rapid Zero-Secrets Setup](/docs/assets/quickstart-setup.gif)`*
> **Contents:** Terminal recording demonstrating a developer running `yarn install`. The offline ECDSA key generator automatically creates `.env.local` without network dependencies. The developer requests testnet HBAR from the official Hedera Portal Faucet, runs `yarn script:prepare`—which verifies mirror node balance, deploys `Vault.sol` and `AgentRegistry.sol`, provisions the 3 HCS topics, and syncs `.env.local`—and launches the application with `yarn next:dev` in under 60 seconds.

---

## 1. Zero-Secrets Quickstart (Sovereign Testnet Provisioning)

Traditional Web3 setups require developers to manually manage private keys or rely on external third-party dispenser services that risk uptime and credential leakage. Scaffold-HBAR Agent Payments solves this with an offline-first, zero-secrets onboarding pipeline that keeps credentials strictly on your machine while adhering to Mechanical Gate 8 (Zero Committed Secrets).

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 20.18.3`
- [Yarn](https://yarnpkg.com/) (`corepack enable && corepack prepare yarn@stable --activate`)
- Git configured with `user.name` and `user.email`

### Quickstart Commands

```bash
# 1. Clone repository and install dependencies
git clone https://github.com/<org>/machine-machine-payments.git
cd machine-machine-payments
yarn install

# 2. Fund your generated Hedera testnet account
# Visit https://portal.hedera.com/faucet and paste the EVM address or Account ID printed during install

# 3. Deploy contracts and provision HCS topics in one unified command
yarn script:prepare

# 4. Boot the local development environment
yarn next:dev
```

### What Happens Behind the Scenes

1. **Offline Keypair Generation (`postinstallKeygen.ts`):**
   - Automatically executes during `yarn install`.
   - Generates a local ECDSA secp256k1 keypair using `@hiero-ledger/sdk` completely offline.
   - Derives the corresponding EVM alias (`0x...`).
   - Writes credentials safely to `.env.local` and `packages/nextjs/.env.local`. Git ignores these files to maintain zero committed secrets.

2. **Unified Infrastructure Preparation (`yarn script:prepare`):**
   - **Balance Verification:** Queries the Hedera testnet Mirror Node REST API (`https://testnet.mirrornode.hedera.com/api/v1/accounts/<target>`) to ensure the account is funded. If unfunded, it prints the faucet link and halts cleanly without unhandled exceptions.
   - **Contract Deployment:** Compiles and deploys `Vault.sol` (Consensus Spend Controls) and `AgentRegistry.sol` (ERC-8004 Identity Registry) to Hedera testnet via Hardhat, automatically generating TypeScript ABIs in `packages/nextjs/contracts/deployedContracts.ts`.
   - **HCS Topic Creation:** Provisions the 3 core consensus topics:
     - Spend Audit Topic (`agent-spend-audit`)
     - Policy Registry Topic (`hcs-2:0:86400`)
     - Agent Trust Audit Topic (`agent-trust-audit`)
   - **Environment Synchronization:** Updates `.env.local` across workspaces with the newly deployed contract IDs and topic IDs.

---

<!-- GIF PLACEHOLDER 2: Scaffolding a Protected x402 Route with script:make-route -->
> [!NOTE]
> **GIF Demonstration: Protected Route Code Scaffolder CLI**
> *Placeholder: `![Make Route CLI Scaffolder](/docs/assets/make-route-scaffolder.gif)`*
> **Contents:** Developer runs `yarn script:make-route --name sentiment --price 0.5 --trust`. The CLI instantly generates `packages/nextjs/app/api/sentiment/route.ts` with the composable middleware onion (`withAgentTrust` -> `withX402` -> `withSpendGuard`), calculates 50,000,000 tinybars pricing (0.5 HBAR), and embeds an explicit developer `// TODO` block. Running `curl http://localhost:3000/api/sentiment` immediately returns an authentic HTTP `402 Payment Required` challenge.

---

## 2. Feature Deep-Dive: Protected Route Code Scaffolder (`script:make-route`)

Inspired by Laravel's `php artisan make` command, Scaffold-HBAR includes an artisan CLI code generator designed to scaffold ready-to-run Next.js App Router x402-protected API endpoints in seconds.

### Command Specification & Options

```bash
yarn script:make-route --name <endpointName> [options]
```

| Flag / Option | Type | Description | Default |
| --- | --- | --- | --- |
| `--name <name>`, `-n` | `string` | API endpoint name (e.g. `sentiment`, `weather`, `compute`) | *Required* |
| `--price <hbar>`, `-p` | `number` | Resource access price in HBAR (e.g. `0.1`, `1`, `5`) | `1` HBAR ($10^8$ tinybars) |
| `--path <path>` | `string` | Custom App Router relative path (e.g. `api/v1/sentiment`) | `api/<name>` |
| `--trust` | `boolean` | Wraps endpoint with ERC-8004 `withAgentTrust` identity verification | `false` |
| `--no-guard` | `boolean` | Disables Spend Guard policy enforcement layer | `false` (guard active) |
| `--force`, `-f` | `boolean` | Overwrites existing endpoint if file already exists | `false` |

### Scaffolder Workflow

When executed, `yarn script:make-route`:
1. Calculates exact tinybar values ($1\text{ HBAR} = 10^8\text{ tinybars}$).
2. Dynamically routes revenue to `NEXT_PUBLIC_VAULT_ADDRESS` / `VAULT_CONTRACT_ID` if deployed, or falls back to the seller operator account.
3. Composes the onion middleware pipeline:
   - `withAgentTrust`: Cryptographically authenticates client DID and signature against on-chain `AgentRegistry.sol`.
   - `withX402`: Handles HTTP 402 challenge negotiation, client signature validation, and facilitator settlement.
   - `withSpendGuard`: Enforces budget caps and submits tamper-proof decision receipts to the HCS audit topic.
4. Injects an explicit `// TODO` block directing the developer where to insert their monetizeable logic.

### Generated Route Code Example

```typescript
import { NextResponse } from "next/server";
import { withAgentTrust } from "~~/services/trust";
import { withX402 } from "~~/services/facilitator";
import { withSpendGuard } from "~~/services/guard";

// 0.5 HBAR = 50000000 tinybars
const PRICE_TINYBAR = "50000000";

// Payment destination: Routes to Vault if deployed, else seller account
const PAY_TO =
  process.env.NEXT_PUBLIC_VAULT_ADDRESS || process.env.VAULT_CONTRACT_ID || process.env.AGENT_ACCOUNT_ID || "0.0.X";

/**
 * x402 protected resource handler: sentiment
 */
const sentimentHandler = async (req: Request, { payment, guard, agent }: any) => {
  // =========================================================================
  // TODO: Implement the service or data you are selling here!
  //
  // This code only executes AFTER the client successfully completes the
  // x402 micropayment challenge and passes spend guard / trust policies.
  //
  // Ideas:
  // - Run an AI model inference or compute job
  // - Fetch private database records or real-time data feeds
  // - Call a premium upstream API or microservice
  // =========================================================================

  const servicePayload = {
    service: "sentiment",
    sentiment: "bullish",
    confidence: 0.98,
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({
    success: true,
    message: "Resource unlocked successfully via x402 payment.",
    settlementReceipt: payment?.settlement,
    guardPolicy: guard?.policyDecision,
    agentCaller: agent?.did,
    data: servicePayload,
  });
};

export const GET = withAgentTrust(
  withX402(
    withSpendGuard(sentimentHandler, {
      maxPriceHbar: 10,
      recordAudit: true,
    }),
    {
      priceTinybar: PRICE_TINYBAR,
      payTo: PAY_TO,
      memo: "x402-sentiment",
    },
  ),
);

export const POST = GET;
```

---

<!-- GIF PLACEHOLDER 3: Agent Onboarding Stepper & Live Fleet Dashboard -->
> [!NOTE]
> **GIF Demonstration: Agent Onboarding Stepper & Live Fleet Dashboard**
> *Placeholder: `![Agent Onboarding & Spend Dashboard](/docs/assets/agent-onboarding-dashboard.gif)`*
> **Contents:** Seller opens the Onboarding Portal at `/onboard`, generates a one-time claim code with a 10 HBAR cap, and copies the agent command. In a separate terminal, an autonomous AI client agent reads the dynamic `/skill.md` instructions, generates an OWS secp256k1 keypair, and redeems the claim code. The portal stepper smoothly transitions through `waiting` -> `claimed` -> `wallet` -> `active`. The seller navigates to `/dashboard` to view live 24h spend metrics, active fleet members, mirror node balances, and clickable HashScan consensus settlement receipts.

---

## 3. Agent Fleet Onboarding & Live Spend Dashboard

To support seamless autonomous agent interactions, Scaffold-HBAR provides a dedicated agent onboarding system and fleet spend dashboard.

### 1. Dedicated Agent Onboarding Portal (`/` / `/onboard`)

- **Frictionless Minting:** Sellers mint single-use claim codes with human-readable labels and optional spend caps.
- **Zero Raw Secrets in Transcripts:** No private keys or permanent API tokens are ever passed into agent chat prompts. Claim codes expire in 24 hours.
- **5-Stage Live Lifecycle Stepper:**
  1. `waiting`: Claim code minted, waiting for agent redemption.
  2. `claimed`: Agent has submitted claim code in exchange for a scoped API bearer token (`mmp_live_...`).
  3. `wallet`: Agent has registered their Hedera Account ID and EVM alias with the seller.
  4. `awaiting_funding`: Waiting for initial testnet balance confirmation on the Mirror Node.
  5. `active`: Agent account confirmed and fully verified on Hedera testnet.

### 2. Dynamic Machine-Readable Agent Skill (`/skill.md`)

Autonomous agents integrating with the merchant can ingest instructions dynamically by reading `http://<host>/skill.md`:
- Guides the agent on initializing local non-custodial keystores using Open Wallet Standard (OWS).
- Details the one-time `POST /api/agents/claim` endpoint format.
- Explains x402 HTTP header negotiation (`402 PAYMENT-REQUIRED` -> `TransferTransaction` signing -> `PAYMENT-SIGNATURE` retry).

### 3. Seller & Agent Fleet Spend Dashboard (`/dashboard`)

A dark-mode dashboard tailored for merchants and fleet operators:
- **Top KPI Metrics:** 24h Spend (HBAR & USD estimate), 7d Spend, Active Agents count, and Total API Requests.
- **Daily Spend Chart:** 7-day spend visualization bucketed by day.
- **Agent Fleet Table:** Displays agent label, DID, status pill, total spend to date, and live testnet balance polled directly from the Hedera Mirror Node.
- **Consensus Settlement Receipts:** Displays consensus timestamp, counterparty agent DID, protected route called, tinybar/HBAR value, and direct links to testnet transactions on HashScan.
- **Pluggable Storage:** File-backed zero-dependency store (`JsonAgentStore`) with swappable SQLite / external database interfaces.

---

<!-- GIF PLACEHOLDER 4: Spend Guard Multi-Tier Escalation & x402 Micropayment Settlement -->
> [!NOTE]
> **GIF Demonstration: Spend Guard Multi-Tier Escalation & x402 Micropayment Settlement**
> *Placeholder: `![Spend Guard Multi-Tier Escalation](/docs/assets/spend-guard-escalation.gif)`*
> **Contents:** AI agent submits a request exceeding `perTaskHbar`. Spend Guard intercepts the transaction, records an `ESCALATE` decision to the HCS audit topic, constructs an authentic Hedera `ScheduleCreateTransaction` (HIP-423), and outputs the `scheduleId` for manual human signing. A subsequent request within budget executes instantly, settles via the x402 facilitator, logs an `ALLOW` receipt to HCS, and resolves with an HTTP 200 payload.

---

## 4. Multi-Tier Spend Guard & ERC-8004 Trust Engine

The architecture combines non-custodial financial safety with cryptographic identity verification across four coordinated layers:

```
┌──────────────────────────────────────────────────────────────┐
│                    Next.js Application Layer                 │
│   - x402 Endpoints (/api/*)        - Dashboard (/dashboard)  │
│   - Onboarding Portal (/onboard)   - Verify Portal (/verify) │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│               ERC-8004 Trust & Identity Layer                │
│   - AgentRegistry.sol (HSCS)   - withAgentTrust Middleware   │
│   - HAK v4 Trust Plugin        - HCS Trust Audit Topic       │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│              Multi-Tier Spend Guard Engine                   │
│   - L0 Pre-flight Checks       - L1 Rolling 24h Budgets      │
│   - L2 On-Chain Vault (HSCS)   - HITL Scheduled Txs (HIP-423)│
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│               Dual-Flavor x402 Facilitators                  │
│   - Public Hosted (Blocky402)  - Self-Hosted Route Handlers  │
└──────────────────────────────┬───────────────────────────────┘
                               │
┌──────────────────────────────▼───────────────────────────────┐
│               Native Hedera Services (Hedera Network)        │
│   - HSCS (Vault.sol, AgentRegistry.sol)                      │
│   - HTS (Precompile 0x167 cryptoTransfer)                    │
│   - HCS (Spend Audit, Policy Registry, Trust Audit)          │
└──────────────────────────────────────────────────────────────┘
```

### Layer 1: ERC-8004 Agent Identity & Trust

- **On-Chain Identity Registry (`packages/hardhat/contracts/AgentRegistry.sol`):**
  - ERC-8004 compliant on-chain registry mapping agent addresses to verified DIDs, descriptions, and HTTP service endpoints.
  - Implements registration, endpoint updates, deactivation, and registration fees on HSCS.
- **Hedera Agent Kit v4 Plugin (`packages/nextjs/services/trust/plugin`):**
  - Conforms to `@hashgraph/hedera-agent-kit` v4 `Plugin` architecture using `BaseTool` abstractions.
  - Exposes tools for registering agents, checking registration status, and verifying cryptographic DID signatures.
- **Composable Trust Middleware (`withAgentTrust`):**
  - Intercepts incoming requests, validates `X-Agent-DID`, cryptographic signatures, and timestamp replay windows against on-chain state before allowing payment processing.

### Layer 2: Multi-Tier Spend Guard Engine

Located in `packages/nextjs/services/guard`, Spend Guard provides dual integration surfaces:
1. **Hedera Agent Kit v4 Policies:** Official policies (`SpendLimitPolicy`, `CounterpartyAllowlistPolicy`, `ApprovalTierPolicy`, `RejectToolPolicy`) compatible with LangChain, Vercel AI SDK, and ElizaOS.
2. **Programmatic Route Guard:** `withSpendGuard()` middleware and `executePayment()` method for direct Next.js Route Handlers.

Enforcement Ladder:
- **L0 / Pre-Flight Validation:** Rejects blocked tools, non-allowlisted counterparties, or malformed transactions in memory before network submission.
- **L1 / Atomic Reservation & Rolling Budgets:** Enforces `perTaskHbar` and rolling 24-hour `perDayHbar` limits with atomic hold-and-commit semantics.
- **L2 / On-Chain Consensus Vault:** When configured (`VAULT_CONTRACT_ID` / `NEXT_PUBLIC_VAULT_ADDRESS`), spend caps are enforced directly in consensus by `Vault.sol` via HTS `0x167` `cryptoTransfer` precompile disbursements.
- **Non-Custodial HITL Escalation (HIP-423):** Payments exceeding autonomous caps do not fail silently—they automatically construct a `ScheduleCreateTransaction`, record an `ESCALATE` record on HCS, and return the `scheduleId` for human signing.

### Layer 3: Tamper-Proof Audit Logging & HCS-2 Policy Registry

Every payment decision and policy event is recorded immutably on Hedera Consensus Service:
- **Spend Audit Topic (`agent-spend-audit`):** Submits consensus-timestamped decision payloads containing transaction hashes, tinybar values, counterparty IDs, and reason codes (`ALLOW`, `BLOCK`, `ESCALATE`).
- **Trust Audit Topic (`agent-trust-audit`):** Submits consensus-timestamped audit records for agent identity registrations and authentication events.
- **HCS-2 Versioned Policy Registry:** Records policy state changes in indexed HCS-2 format (`hcs-2:0:<ttl>`) using an owner-only submit key, allowing mirror nodes to independently replay and verify policy history.

---

## 5. Dual-Flavor x402 Facilitator Architecture

The x402 specification enables machine-to-machine HTTP paywalls. Scaffold-HBAR provides a dual-flavor facilitator architecture supporting both instant zero-config prototyping and production self-sovereignty:

### Flavor Comparison

| Feature | Flavor 1: Hosted Public (Default) | Flavor 2: Self-Hosted Sovereign |
| --- | --- | --- |
| **Command** | `yarn next:dev` | `yarn dev:self-hosted` |
| **Facilitator Base URL** | `https://api.testnet.blocky402.com` (or `x402.org`) | `http://localhost:3000/api/x402/facilitator` |
| **Operator Setup** | None required | Uses local `HEDERA_OPERATOR_*` |
| **Fee Sponsorship** | Sponsored by public facilitator | Sponsored by your local operator |
| **Recommended Use** | Hackathons, quickstarts, client testing | Production, private testnets, enterprise |

### Live Capability Discovery

Confirm Hedera testnet support on the active facilitator:

```bash
# Query capability discovery endpoint
curl -s http://localhost:3000/api/x402/facilitator/supported | jq
```

---

## 6. Verification & 100% Offline Test Suite

To comply strictly with Mechanical Gate 11, every test in the repository executes and passes **completely offline** with no live RPC, internet connection, or pre-funded accounts required.

### Running the Test Suite

```bash
# Run all offline test suites across all packages
yarn test

# Run individual test suites
yarn test:scaffold     # Validates prepare balance check and makeRoute CLI generator
yarn test:guard        # Validates Spend Guard pre-flight, budgets, and atomic holds
yarn test:policy       # Validates HCS-2 registry serialization and replay parsing
yarn test:facilitator  # Validates x402 capability discovery, signatures, and mock settlement
yarn test:trust        # Validates ERC-8004 DID validation, signatures, and HAK plugin
yarn test:middleware   # Validates withX402, withSpendGuard, and withAgentTrust pipeline
yarn test:agents       # Validates agent onboarding, claim code lifecycle, and store
yarn hardhat:test      # Validates Vault.sol, AgentRegistry.sol, and HTS precompile mocks
```

### Clean Build & Typecheck Verification (Zero Warnings, Zero Errors)

```bash
# Verify TypeScript and linting across all workspaces
yarn lint
yarn next:check-types
yarn hardhat:check-types

# Verify production Next.js build
yarn next:build
```

---

## 7. Developer Reference & CLI Commands Summary

| Script Command | Workspace | Description |
| --- | --- | --- |
| `yarn script:prepare` | Root | Checks balance, deploys `Vault` + `AgentRegistry`, creates 3 HCS topics |
| `yarn script:make-route` | Root | Scaffolds a new x402-protected App Router endpoint (`--name`, `--price`, `--trust`) |
| `yarn next:dev` | Root | Boots Next.js with public hosted x402 facilitator (`blocky402.com`) |
| `yarn dev:self-hosted` | Root | Boots Next.js with self-hosted sovereign x402 facilitator Route Handlers |
| `yarn test` | Root | Runs 100% offline test suite across all packages |
| `yarn hardhat:compile` | Hardhat | Compiles Solidity contracts and generates TypeScript ABIs |
| `yarn hardhat:test` | Hardhat | Executes Hardhat unit tests with mocked Hedera Token Service |
| `yarn hardhat:deploy` | Hardhat | Deploys contracts to local node or Hedera testnet |
