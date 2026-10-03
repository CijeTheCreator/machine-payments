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
- [x] **2. Hosted Zero-Config Testnet Micro-Faucet & CLI Auto-Provisioning:**
  - Dedicated external serverless micro-dispenser API hosting a funded testnet treasury outside the repository to strictly protect Mechanical Gate 8 (Zero Committed Secrets).
  - Single-command CLI onboarding (`npm run script:fund-agent`): generates a fresh Hedera ED25519/ECDSA keypair, requests initial testnet HBAR from the dispenser, and writes `.env.local` automatically.
  - Zero UI footprint: dispenser interaction is strictly developer/CLI-driven to preserve clean production dApp aesthetics and prevent public treasury draining.
- [ ] **3. Quick Developer Scripts & Vault Auto-Deployment (`scripts/`):**
  - Single-command CLI utilities in `package.json`:
    - `script:create-agent` & `script:fund-agent` (account provisioning)
    - `script:auto-deploy-vault` & `script:deploy-vault` (automatic on-chain HSCS `Vault` deployment with HTS precompile wiring and `.env.local` address sync)
    - `script:create-topic` & `script:publish-policy` (HCS audit & HCS-2 registry)
    - `script:grant-allowance` (HIP-336 non-custodial allowance & instant kill switch)
    - `script:propose-scheduled` & `script:sign-schedule` (HIP-423 scheduled transaction workflow)
    - `script:check-balance` (multi-account balance and allowance inspection)
- [ ] **4. Multi-Tier Agent Spending Controls & Non-Custodial Governance:**
  - Unified Configuration (`scaffold.config.yaml`): Root-level declarative YAML configuration specifying agent modes, budget caps (`perTaskHbar`, `perDayHbar`), allowlists, blocked tools, and HCS settings, with dynamic `.env.local` override support.
  - Native Zero-Bloat Guard Module (`packages/nextjs/services/guard`): First-class, drop-in spend guard with dual API surface:
    - Hedera Agent Kit v4 (`@hashgraph/hedera-agent-kit`) hooks & policies (`SpendLimitPolicy`, `CounterpartyAllowlistPolicy`, `ApprovalTierPolicy`, `RejectToolPolicy`).
    - Programmatic `executePayment()` method for direct Next.js Route Handlers and machine-to-machine x402 endpoints.
  - Multi-Tier Enforcement Ladder with Auto-Detection:
    - Off-Chain Hook Layer (L0/L1): Pre-flight validation, atomic hold reservations, and rolling 24h budget tracking via zero-dependency in-memory store with optional SQLite adapter.
    - On-Chain Consensus Vault (L2): Auto-detected when `VAULT_CONTRACT_ID` / `NEXT_PUBLIC_VAULT_ADDRESS` is set, enforcing caps in consensus via `Vault.sol` with HTS `0x167` `cryptoTransfer` precompile disbursements.
  - Non-Custodial Governance & HITL Escalation (HIP-336 & HIP-423): Payments under `perTaskCap` auto-execute; payments exceeding the cap construct an authentic Hedera `ScheduleCreateTransaction`, record an `ESCALATE` decision to HCS, and return the `scheduleId` for owner signing via CLI or UI.
  - Consensus Settlement & Audit Logging: Tamper-proof HCS audit topic (`agent-spend-audit`) recording all `ALLOW`, `BLOCK`, and `ESCALATE` decisions, with fee-free defaults and support for optional HIP-991 consensus custom fees.
- [ ] **5. Dual-Flavor Facilitator & Next.js API Routes:**
  - `npm run dev` (Default - Zero Config): Connects directly to Hedera's public hosted `blocky402.com` facilitator with zero local operator key setup.
  - `npm run dev:self-hosted`: Boots a co-located Next.js Route Handler (`/api/x402/facilitator`) for self-contained fee sponsorship and offline sovereignty.
- [ ] **6. HCS-2 Versioned Policy Registry & Mirror Node Verification (`/verify`):**
  - HCS-2 indexed registry topic (`hcs-2:0:<ttl>`) with owner-only submit key for immutable, consensus-timestamped policy versioning.
  - Independent `/verify` Next.js route that reads Mirror Node REST APIs to audit policy history and verify payment receipts against active limits.
- [ ] **7. Native Hedera Wallet & Scaffold-HBAR UI Components:**
  - HashPack and Blade wallet connection via Hedera WalletConnect (HIP-820) operating natively with Hedera Account IDs (`0.0.X`) and zero EVM/Wagmi bundle bloat.
  - Integration of official `@scaffold-hbar-ui/components` (`<Address />`, `<Balance />`, `<HbarInput />`, `<HederaAddressInput />`) and `@scaffold-hbar-ui/hooks` (`useHederaAccountId`, `useHederaEvmAddress`, `useAddress`) providing live USD/HBAR pricing and dual `0.0.X` / `0x...` Mirror Node resolution.
- [ ] **8. Interactive Contract Debugger (`/debug` via `@scaffold-hbar-ui/debug-contracts`):**
  - Dedicated `/debug` route rendering dynamic forms for all read/write methods on deployed contracts (`Vault`).
  - Integer inputs with native Hedera decimal multiplier buttons (`×1e8` for tinybar to HBAR and `×1e18` for wei to ETH).
  - Real-time contract state inspection and event log monitoring.
- [ ] **9. Interactive Dashboard (Inspired by Hedera Agent Lab):**
  - Next.js dashboard visualizer displaying real-time agent spending streams, budget ceiling meters, and live HCS consensus audit receipts.
  - Dual-mode execution toggle: Autonomous Mode vs. Human-in-the-Loop (HITL) approval modal.
- [ ] **10. Interactive In-App Documentation Hub (`/docs` & `/docs/api`):**
  - Built-in Next.js `/docs` portal rendering quickstarts, environment setup guides, architecture overviews, and interactive API definitions driven by structured metadata.
  - Reference documentation covering native Hedera HIP integrations, CLI scripts, and policy configuration.
- [ ] **11. Proven on Testnet Artifact Verification (Mechanical Gate 7):**
  - Staging and live execution of verifiable testnet proof table in `README.md` and `/verify`:

    | Artifact | Target Testnet Entity | What It Proves |
    | --- | --- | --- |
    | `Vault` Contract | HSCS Contract ID | Over-cap & non-allowlisted payments revert in consensus |
    | HCS-2 Policy Registry | HCS Topic ID | Spend caps versioned, owner-only, and replayable |
    | HCS Audit Topic | HCS Topic ID | Every policy decision recorded immutably |
    | Facilitator Micro-Settlement | CryptoTransfer Tx ID | Machine payment execution via x402 / micropayments |

  - Automated verification script (`script:verify-testnet`) ensuring all linked entities resolve with HTTP 200 on public Hedera Mirror Nodes.


