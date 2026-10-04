# Scaffold-HBAR — Agent & Machine Payments

Monetize Next.js API routes with native HBAR micropayments (x402), onboard autonomous AI agents with non-custodial wallets, and govern agent spending on Hedera.

📖 **Documentation:**
- **[Quickstart Guide](docs/getting-started.md)** — Step-by-step setup, route scaffolding, agent onboarding, and spend monitoring.
- **[Architecture Reference](docs/architecture.md)** — System diagrams, smart contracts (`Vault.sol`), HTS precompile `0x167`, and HCS audit topics.

---

## What you can do

- **Scaffold paid API routes:** Generate x402-gated endpoints with one CLI command (`yarn script:make-route`).
- **Onboard AI agents safely:** Mint single-use claim codes via a web portal without sharing private keys.
- **Auto-discovery for agents:** Expose dynamic machine-readable capabilities via `/skill.md`.
- **Govern agent spending:** Restrict per-task and daily budgets with non-custodial smart contract vaults and human-in-the-loop escalation.
- **Settle on testnet instantly:** Dual-flavor x402 facilitators for instant public testing (`yarn next:dev`) or sovereign self-hosted operation (`yarn dev:self-hosted`).
- **Audit in real time:** Immutably log all payment decisions and agent trust events to Hedera Consensus Service.

---

## Quickstart

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 20.18.3`
- [Git](https://git-scm.com/)
- [Yarn](https://yarnpkg.com/) (`corepack enable && corepack prepare yarn@stable --activate`)

### Setup in 4 Steps

```bash
# 1. Clone repository and install dependencies (generates offline operator keys)
git clone https://github.com/<org>/machine-machine-payments.git
cd machine-machine-payments
yarn install

# 2. Fund your generated testnet account
# Visit https://portal.hedera.com/faucet and paste the address or Account ID printed during install

# 3. Deploy contracts and consensus topics
yarn script:prepare

# 4. Start the application
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000) to access the **Agent Onboarding** portal, view the **Fleet Spend Dashboard** at `/dashboard`, inspect contracts at `/debug`, or verify audit trails at `/verify`.

---

## Developer Commands

### Core Workflows

| Command | Workspace | Description |
| --- | --- | --- |
| `yarn script:prepare` | Root | Checks balance, deploys `Vault` + `AgentRegistry`, creates 3 HCS topics |
| `yarn script:make-route` | Root | Scaffolds an x402-protected App Router endpoint (`--name`, `--price`, `--trust`) |
| `yarn next:dev` | Root | Starts Next.js app in public facilitator mode (`blocky402.com`) |
| `yarn dev:self-hosted` | Root | Starts Next.js app with self-hosted sovereign facilitator route handlers |

### 100% Offline Test Suite

Every unit and integration test in this repository runs completely offline without network connections or funded accounts:

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

## Project Structure

- **`docs/`** — [Quickstart Guide](docs/getting-started.md) and [Architecture Reference](docs/architecture.md)
- **`packages/hardhat`** — Solidity contracts (`Vault.sol`, `AgentRegistry.sol`), deployment scripts, and unit tests
- **`packages/nextjs`** — Next.js 14 App Router application, Spend Guard engine, x402 facilitator, Agent Trust plugin, onboarding portal, and spend dashboard
- **`scripts`** — CLI utilities (`prepare.ts`, `makeRoute.ts`, `postinstallKeygen.ts`)
- **`test`** — Offline unit and integration test suites
