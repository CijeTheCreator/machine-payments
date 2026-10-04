# Plan: Scaffold-HBAR Agent & Machine Payments

This document records the non-negotiable mechanical gate requirements imposed by Hedera and the active implementation checklist. All exploratory research and background analysis live in `planning.md`.

---

## 1. Hedera Mechanical Eligibility Gate

Any template submitted must pass every item in Hedera's automated Stage 1 evaluation script before reaching judges:

1. **Scaffold Execution:** Scaffolds cleanly from a fresh terminal via:
   ```bash
   npm create scaffold-hbar@latest -- --template <org>/<repo>
   ```
2. **Template Manifest:** `template.json` is present in the repository root and strictly adheres to the `create-scaffold-hbar` Zod schema (declaring capabilities, defaults, envVars, and outro steps).
3. **Core Documentation:** Both `README.md` (covering setup) and `AGENTS.md` (covering AI-assisted use) must be present.
4. **Clean Build Pipeline:** `install`, `lint`, and `build` commands pass cleanly from a fresh scaffold with zero warnings and zero errors.
5. **Route Liveness:** The application boots cleanly and all core routes return HTTP 200 OK.
6. **Hedera Service Integration:** At least one native Hedera service (HTS, HCS, or HSCS) is genuinely in play.
7. **Verifiable Testnet Evidence:** At least one verifiable Hedera testnet transaction must be provided, evidenced by a public mirror node or Hashscan link.
8. **No Committed Secrets:** No private keys, credentials, or committed `.env` files anywhere in git history.
9. **Licensing:** Released under an open-source MIT License with original code.
10. **Environment & Runtime:** Yarn workspaces monorepo with separate `packages/` on Node.js >= 20.18.3.
11. **Offline Test Suite:** 100% of unit tests must run and pass offline with no live network or funded accounts required.

---

## 2. Plan (Implementation Checklist)

- [x] **1. Standard Hardhat Contract Workspace (`packages/hardhat`) & Auto-Generated ABIs:**
  - Monorepo `packages/hardhat` workspace containing `Vault.sol`, deployment scripts (`deploy/00_deploy_vault.ts`), and unit tests.
  - Automatic compilation pipeline generating ABIs and deployed addresses to `packages/nextjs/contracts/deployedContracts.ts` for full TypeScript autocomplete.
  - Configured Hashio JSON-RPC endpoints with testnet deployment (`yarn hardhat:deploy --network hederaTestnet`) and HashScan contract verification (`yarn hardhat:verify:testnet`).
- [x] **2. Offline Key Provisioning & Zero-Secrets Onboarding:**
  - Automated offline ECDSA keypair generator executing during `postinstall` (`scripts/postinstallKeygen.ts`) to initialize credentials in `.env.local` without committing secrets (Gate 8).
  - Clean developer onboarding flow directing merchants to fund their generated EVM alias via official Hedera Portal Faucet (`https://portal.hedera.com/faucet`) or input existing portal keys.
  - Zero external faucet serverless dependencies, ensuring 100% repository sovereignty and gate compliance.
- [x] **3. Unified Infrastructure Preparation Script (`script:prepare`):**
  - Single-command merchant infrastructure deployer (`scripts/prepare.ts`):
    - Verifies testnet account balance via public Mirror Node; if unfunded, cleanly prints the faucet portal link and halts gracefully without uncaught exceptions.
    - Compiles and deploys `Vault.sol` (Consensus Spend Controls) and `AgentRegistry.sol` (ERC-8004 Identity Registry) to Hedera Testnet via Hardhat with deployed ABIs exported to Next.js.
    - Creates the 3 essential HCS topics: Spend Audit (`HCS_AUDIT_TOPIC_ID`), Policy Registry (`HCS_POLICY_TOPIC_ID`), and Trust Audit (`AGENT_TRUST_AUDIT_TOPIC_ID`).
    - Automatically updates `.env.local` and `packages/nextjs/.env.local` with contract addresses and topic IDs.
- [x] **3b. Protected Route Code Scaffolder (`script:make-route`):**
  - CLI code generator inspired by `php artisan make` that scaffolds ready-to-run Next.js App Router x402-protected API endpoints (`scripts/makeRoute.ts`).
  - Strict CLI-flag interface: `yarn script:make-route --name <endpointName> [--price <hbar>] [--path <customPath>] [--no-guard] [--trust] [--force]`.
  - Automatically calculates tinybar pricing ($1\text{ HBAR} = 10^8\text{ tinybar}$), defaults to 1 HBAR, and routes revenue directly to on-chain `Vault` if deployed or seller account.
  - Injects composable middleware pipeline: `withAgentTrust` (identity) -> `withX402` (payment challenge & settlement) -> `withSpendGuard` (inbound policy enforcement & HCS audit).
  - Inserts a clear `// TODO` block inside the generated route handler guiding the merchant where to put their monetizeable service logic.
  - Comprehensive 100% offline test suite (`test/prepareAndScaffold.test.ts`).
- [x] **4. Multi-Tier Agent Spending Controls & Non-Custodial Governance:**
  - Unified Configuration (`scaffold.config.yaml`): Root-level declarative YAML configuration specifying agent modes, budget caps (`perTaskHbar`, `perDayHbar`), allowlists, blocked tools, and HCS settings, with dynamic `.env.local` override support.
  - Native Zero-Bloat Guard Module (`packages/nextjs/services/guard`): First-class, drop-in spend guard with dual API surface:
    - Hedera Agent Kit v4 (`@hashgraph/hedera-agent-kit`) hooks & policies (`SpendLimitPolicy`, `CounterpartyAllowlistPolicy`, `ApprovalTierPolicy`, `RejectToolPolicy`).
    - Programmatic `executePayment()` method for direct Next.js Route Handlers and machine-to-machine x402 endpoints.
  - Multi-Tier Enforcement Ladder with Auto-Detection:
    - Off-Chain Hook Layer (L0/L1): Pre-flight validation, atomic hold reservations, and rolling 24h budget tracking via zero-dependency in-memory store with optional SQLite adapter.
    - On-Chain Consensus Vault (L2): Auto-detected when `VAULT_CONTRACT_ID` / `NEXT_PUBLIC_VAULT_ADDRESS` is set, enforcing caps in consensus via `Vault.sol` with HTS `0x167` `cryptoTransfer` precompile disbursements.
  - Non-Custodial Governance & HITL Escalation (HIP-336 & HIP-423): Payments under `perTaskCap` auto-execute; payments exceeding the cap construct an authentic Hedera `ScheduleCreateTransaction`, record an `ESCALATE` decision to HCS, and return the `scheduleId` for owner signing via CLI or UI.
  - Consensus Settlement & Audit Logging: Tamper-proof HCS audit topic (`agent-spend-audit`) recording all `ALLOW`, `BLOCK`, and `ESCALATE` decisions, with fee-free defaults and support for optional HIP-991 consensus custom fees.
- [x] **5. Dual-Flavor Facilitator & Next.js API Routes:**
  - `npm run dev` (Default - Zero Config): Connects directly to Hedera's public hosted `blocky402.com` facilitator (`https://api.testnet.blocky402.com`) with fallback to `x402.org` with zero local operator key setup.
  - `npm run dev:self-hosted`: Boots co-located Next.js Route Handlers (`/api/x402/facilitator`, `/supported`, `/verify`, `/settle`) for self-contained fee sponsorship and offline sovereignty.
  - Initial x402 sample resource route (`/api/x402/resource`) handling 402 challenge negotiation, signature verification, and consensus micro-settlement.
  - Fast, 100% offline test suite (`yarn test:facilitator`) covering capability discovery, TransferTransaction verification, and mock consensus settlement.
- [x] **6. HCS-2 Versioned Policy Registry & Mirror Node Verification (`/verify`):**
  - HCS-2 indexed registry topic (`hcs-2:0:<ttl>`) with owner-only submit key for immutable, consensus-timestamped policy versioning.
  - Independent `/verify` Next.js route that reads Mirror Node REST APIs to audit policy history and verify payment receipts against active limits.
- [x] **7. Dedicated Agent Onboarding Page (`/` / `/onboard`) & OWS Keystore Integration:**
  - First page a developer or seller lands on after repository setup (`yarn next:dev`).
  - Merchant creates agent claim codes with custom labels and optional spend caps.
  - Generates one-time claim codes and copyable HTTP / REST + OWS instructions (`POST /api/agents/claim` with OWS public key/DID from `openwallet.sh`).
  - 5-stage live progress stepper: `waiting` (code minted) -> `claimed` (agent traded code for API key) -> `wallet` (registered with seller) -> `awaiting_funding` -> `active` (verified on Hedera Testnet Mirror Node).
  - Self-service agent / operator portal login to view agent status without requiring browser extension wallets.
- [ ] **8. Interactive Contract Debugger (`/debug` via `@scaffold-hbar-ui/debug-contracts`):**
  - Dedicated `/debug` route rendering dynamic forms for all read/write methods on deployed contracts (`Vault`).
  - Integer inputs with native Hedera decimal multiplier buttons (`×1e8` for tinybar to HBAR and `×1e18` for wei to ETH).
  - Real-time contract state inspection and event log monitoring.
- [x] **9. Minimal Seller & Agent Spend Dashboard (`/dashboard` - Inspired by Cardily):**
  - Sleek, refined dark-mode dashboard tailored for sellers and agent operators.
  - Top KPI Row: 24h Spend (HBAR / USD), 7d Spend, Active Agents count, API Requests count.
  - Daily Spend Chart: 7d/14d spend visualization bucketed by day.
  - Agent Fleet Table: Agent label, DID/Wallet address, Status pill, Spend to date, and Testnet Balance (polled from Hedera Mirror Node).
  - Recent x402 Settlements & Consensus Receipts: Timestamp, Counterparty Agent, Route called, Amount tinybar/HBAR, and public HashScan testnet links.
  - Pluggable storage architecture: Zero-dependency file-backed JSON store (`JsonAgentStore`) with swappable SQLite / external DB adapter interface.
- [x] **10. Interactive Documentation Hub (`docs/getting-started.md` & Architecture Guide):**
  - Comprehensive documentation article styled after Hedera docs rendering quickstarts, environment setup guides, architecture overviews, and interactive API definitions.
  - Reference documentation covering native Hedera HIP integrations, CLI scripts, feature #3b (`script:make-route`) spec, and policy configuration.
- [x] **11. Proven on Testnet Artifact Verification (Mechanical Gate 7):**
  - Staging and live execution of verifiable testnet proof table in `README.md` and `/verify`:

    | Artifact | Target Testnet Entity | What It Proves |
    | --- | --- | --- |
    | `Vault` Contract | HSCS Contract ID | Over-cap & non-allowlisted payments revert in consensus |
    | HCS-2 Policy Registry | HCS Topic ID | Spend caps versioned, owner-only, and replayable |
    | HCS Audit Topic | HCS Topic ID | Every policy decision recorded immutably |
    | Facilitator Micro-Settlement | CryptoTransfer Tx ID | Machine payment execution via x402 / micropayments |

  - Automated verification script (`script:verify-testnet`) ensuring all linked entities resolve with HTTP 200 on public Hedera Mirror Nodes.
- [x] **12. Trustless Agent Identity & Verification System (ERC-8004 + HAK v4 + HCS Audit):**
  - **On-Chain Identity Registry (`packages/hardhat/contracts/AgentRegistry.sol`):**
    - ERC-8004 compliant on-chain registry mapping agent addresses to verified DIDs, metadata descriptions, and HTTP service endpoints.
    - Automated deployment (`deploy/01_deploy_registry.ts`) and offline unit test suite (`packages/hardhat/test/AgentRegistry.test.ts`).
  - **Native Hedera Agent Kit v4 Plugin (`packages/nextjs/services/trust/plugin`):**
    - Custom plugin conforming to `@hashgraph/hedera-agent-kit` v4 `Plugin` interface with `BaseTool` extensions.
    - Tools for agent registration, DID validation, and cryptographic signature verification.
  - **Composable Trust Middleware (`withAgentTrust()`):**
    - High-performance Route Handler middleware validating incoming `X-Agent-DID`, cryptographic signatures, and timestamps against the on-chain registry before routing to protected payment handlers.
  - **Spend Guard Integration (`TrustedAgentPolicy`):**
    - Drops into existing Spend Guard pipeline to dynamically verify counterparty agent identities before micro-settlements execute.
  - **Mirror Node Auditing:**
    - Emits identity registration and authentication receipts to a dedicated HCS topic (`agent-trust-audit`) for public mirror node verification.



