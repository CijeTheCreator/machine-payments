# Curb Analysis & Integration Blueprint

This document analyzes `Madhav-Gupta-28/Curb` (verifiable spend-control for autonomous AI agents on Hedera) to identify architectural patterns, Hedera Improvement Proposals (HIPs), and documentation models to integrate directly into our Scaffold-HBAR template.

---

## 1. Overview of Curb

Curb is a policy and audit layer that wraps an AI agent's payments before execution, logging every decision immutably to Hedera. It introduces a modular three-tier trust ladder:

- **Level 0 (Off-Chain Enforcement):** Hedera Agent Kit v4 lifecycle hooks in the application server enforce allowlists, rolling-24h budgets, and approval tiers.
- **Level 1 (Verifiable Policy & Audit):** Spend policies are versioned on an HCS-2 indexed registry topic (owner-only submit key). Every allow, block, or escalate decision is broadcast to an HCS audit topic. Spend can be independently recomputed via Mirror Node REST.
- **Level 2 (On-Chain Consensus Enforcement):** A Solidity smart contract (`CurbVault.sol`) running on the Hedera Smart Contract Service (HSCS) enforces the caps and allowlists directly in Hedera consensus. It disburses HBAR using the Hedera Token Service (HTS) `0x167` `cryptoTransfer` system precompile.

---

## 2. Comprehensive Hedera Primitives & HIPs Breakdown

Curb leverages Hedera's native primitives and standards end-to-end:

### 1. HIP-336: Non-Custodial Allowances
- **Mechanism:** `AccountAllowanceApproveTransaction` grants the agent account a capped, revocable HBAR allowance.
- **Security Benefit:** Funds remain inside the human owner's account. The agent never holds custody of large balances.
- **Kill Switch:** Calling allowance approval with an amount of `0` immediately revokes the agent's spending authority.

### 2. HIP-423: Scheduled Transactions for Human-in-the-Loop (HITL)
- **Mechanism:** When a proposed payment exceeds the auto-approval threshold, the agent constructs a `TransferTransaction` wrapped in a `ScheduleCreateTransaction` (with memo `curb-approval`).
- **Security Benefit:** The transaction does not execute on Hedera until the required owner signature is provided.
- **Execution:** The owner signs the pending schedule via `ScheduleSignTransaction` from the CLI or in the web UI.

### 3. HIP-820: Hedera WalletConnect Native Web Signing
- **Mechanism:** Browser-based wallet connection supporting HashPack, Blade, and other HIP-820 compliant wallets.
- **Significance:** Operates natively with Hedera Account IDs (`0.0.X`) without requiring EVM RPC bridges, Wagmi, or MetaMask shims. Used for signing HIP-336 allowance grants and HIP-423 schedule approvals.

### 4. HCS (Consensus Service) Audit Trail
- **Mechanism:** Every policy evaluation (allow, block, escalate) submits a structured JSON payload to an immutable HCS topic.
- **Significance:** Provides a tamper-proof audit log that cannot be altered even if the application database or server is compromised.

### 5. HCS-2: Decentralized Versioned Policy Registry
- **Mechanism:** An indexed topic using topic memo format `hcs-2:0:<ttl>` with the owner's public key as the submit key.
- **Payload:** Each policy change is published as an HCS-2 `register` operation carrying the policy configuration encoded in metadata.
- **Significance:** Prevents silent cap inflation or unauthorized policy tampering. Enables retroactive auditing of policy state at any past point in time.

### 6. HSCS & HTS Precompile (Address `0x167` `cryptoTransfer`)
- **Mechanism:** `CurbVault.sol` dispatches outbound HBAR payments using `IHederaTokenService.cryptoTransfer` at address `0x167`.
- **Significance:** On Hedera, EVM contracts cannot reliably push HBAR to standard non-contract accounts using Solidity's `.call{value}`. The HTS precompile is the canonical, consensus-verified method for smart contracts to transfer HBAR.

### 7. Mirror Node REST API Verification
- **Mechanism:** The `/verify` route and verification tools fetch historical messages from the HCS audit topic and HCS-2 policy registry via public Mirror Node endpoints.
- **Significance:** Provides trustless proof to third parties by recalculating aggregate spend directly from consensus timestamps and transaction receipts.

---

## 3. Package and Application Architecture

The Curb codebase consists of two main parts:

### 1. `packages/curb-core` (Standalone Engine)
- Zero-dependency in-memory store by default with support for external stores (e.g., Redis).
- `createCurb({ client, agentAccountId, ... })`: Single helper function returning configured Agent Kit hooks, topic IDs, and store.
- Tool guards using `RejectToolPolicy` to reject destructive operations (`CREATE_ACCOUNT`, `DELETE_ACCOUNT`, `UPDATE_ACCOUNT`, `APPROVE_HBAR_ALLOWANCE`, `DELETE_HBAR_ALLOWANCE`).
- Atomic hold/reserve mechanism for rolling-24h spending windows to prevent concurrent race conditions.

### 2. Next.js Full-Stack App
- **Dashboard (`/app`):** Real-time payment stream, live budget ceiling meters, pending approval queue, and recent consensus transactions.
- **Verification (`/verify`):** Standalone auditing page that pulls directly from Hedera Mirror Nodes to verify spend against active policies.
- **Documentation (`/docs` & `/docs/api/[slug]`):** In-app documentation generated from a structured schema (`api-reference.ts`) covering setup, storage, policies, HCS-2 versioning, and API methods.
- **Developer Scripts (`scripts/`):** CLI utilities for deploying vaults, seeding allowlists, granting allowances, proposing schedules, and publishing policy versions.

---

## 4. Key Takeaways for Scaffold-HBAR

1. **Adopt the Multi-Tier Trust Ladder:** Provide both lightweight Agent Kit v4 off-chain hooks and an optional on-chain `CurbVault` contract.
2. **Standardize on Hedera HIPs:** Unify HIP-336 (allowances), HIP-423 (scheduled transactions), HIP-820 (WalletConnect), and HCS-2 (policy registry).
3. **Embed In-App Documentation (`/docs`):** Include a first-class `/docs` route with interactive API definitions and setup tutorials directly inside the template.
4. **Provide `/verify` Auditing Route:** Give developers an out-of-the-box verification page powered by Mirror Node REST queries.

