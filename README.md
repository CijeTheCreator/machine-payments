# Scaffold-HBAR — Agent & Machine Payments

Complete production template for autonomous AI agents, machine-to-machine micropayments (x402), non-custodial spend guards, ERC-8004 agent trust registries, and Hedera Consensus Service audit registries.

📖 **Comprehensive Guide:** See [Quickstart & Architecture Guide](docs/getting-started.md) for full setup instructions, architecture deep-dives, and technical specifications.

---

## What's in this template

- **Zero-Secrets Merchant Onboarding:** Automated offline ECDSA key generation on `postinstall` with zero external serverless dispenser dependencies.
- **Unified Infrastructure Preparation (`yarn script:prepare`):** One-command deployer that verifies mirror node balance, deploys `Vault.sol` and `AgentRegistry.sol`, and provisions 3 tamper-proof HCS topics.
- **Protected Route Code Scaffolder (`yarn script:make-route`):** Artisan-style CLI generator creating ready-to-run Next.js App Router x402-gated endpoints with composable middlewares.
- **Agent Fleet Onboarding & Spend Dashboard:** Self-service onboarding portal (`/onboard`), dynamic machine-readable agent skill (`/skill.md`), and real-time fleet spend dashboard (`/dashboard`).
- **ERC-8004 Agent Identity & Trust:** On-chain registry (`AgentRegistry.sol`), Hedera Agent Kit v4 trust plugin, and `withAgentTrust` middleware.
- **Multi-Tier Spend Guard Engine:** L0 pre-flight, L1 rolling 24-hour budgets, L2 `Vault.sol` consensus caps, and HIP-423 HITL scheduled transaction escalation.
- **Dual-Flavor x402 Facilitators:** Instant public testnet negotiation (`yarn next:dev`) and self-hosted sovereign Next.js route handlers (`yarn dev:self-hosted`).
- **Tamper-Proof Audit Logging:** HCS spend audit topic (`agent-spend-audit`), trust audit topic (`agent-trust-audit`), and HCS-2 versioned policy registry.
- **100% Offline Test Suite:** Fast unit and integration tests executing completely offline without live RPC or funded accounts (`yarn test`).

---

## Quickstart

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20.18.3
- [Git](https://git-scm.com/) with `user.name` and `user.email` configured
- [Yarn](https://yarnpkg.com/) (`corepack enable && corepack prepare yarn@stable --activate`)

### Setup in 4 Steps

```bash
# 1. Clone repository and install dependencies (auto-generates offline keys)
git clone https://github.com/<org>/machine-machine-payments.git
cd machine-machine-payments
yarn install

# 2. Fund your generated testnet operator account
# Visit https://portal.hedera.com/faucet and paste the EVM address or Account ID printed during install

# 3. Deploy contracts and provision HCS consensus topics
yarn script:prepare

# 4. Boot the Next.js development server
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000) to access the **Agent Onboarding** portal, view the **Fleet Spend Dashboard** at `/dashboard`, inspect contracts at `/debug`, or verify audit trails at `/verify`.

---

## Developer Commands

### Core Workflows

| Command | Workspace | Description |
| --- | --- | --- |
| `yarn script:prepare` | Root | Verifies balance, deploys `Vault` + `AgentRegistry`, creates 3 HCS topics |
| `yarn script:make-route` | Root | Scaffolds x402-protected App Router endpoints (`--name`, `--price`, `--trust`) |
| `yarn next:dev` | Root | Starts Next.js app in public facilitator mode (`blocky402.com`) |
| `yarn dev:self-hosted` | Root | Starts Next.js app with self-hosted sovereign facilitator route handlers |

### 100% Offline Test Suite

```bash
# Run all offline test suites across packages
yarn test

# Run individual test suites
yarn test:scaffold     # Validates prepare balance checks and makeRoute CLI generator
yarn test:guard        # Validates Spend Guard pre-flight, budgets, and atomic holds
yarn test:policy       # Validates HCS-2 registry serialization and replay parsing
yarn test:facilitator  # Validates x402 capability discovery, signatures, and mock settlement
yarn test:trust        # Validates ERC-8004 DID validation, signatures, and HAK plugin
yarn test:middleware   # Validates withX402, withSpendGuard, and withAgentTrust pipeline
yarn test:agents       # Validates agent onboarding, claim code lifecycle, and store
yarn hardhat:test      # Validates Vault.sol, AgentRegistry.sol, and HTS precompile mocks
```

### Build & Quality Checks

```bash
yarn lint
yarn next:check-types
yarn hardhat:check-types
yarn next:build
```

---

## Project Layout

- **packages/hardhat** — Hardhat configuration, Solidity contracts (`Vault.sol`, `AgentRegistry.sol`), deployment scripts, and unit tests
- **packages/nextjs** — Next.js 14 App Router application, Spend Guard engine, x402 facilitator, Agent Trust plugin, onboarding portal, and spend dashboard
- **scripts** — Infrastructure CLI utilities (`prepare.ts`, `makeRoute.ts`, `postinstallKeygen.ts`)
- **test** — Offline test suites enforcing all Stage 1 Mechanical Eligibility Gates

---

## Links

- [Hedera Documentation](https://docs.hedera.com)
- [Hedera Portal Faucet](https://portal.hedera.com/faucet)
- [HashScan Explorer](https://hashscan.io/)
- [Scaffold-HBAR](https://github.com/hedera-dev/scaffold-hbar)
