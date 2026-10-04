# Scaffold-HBAR — Agent & Machine Payments

A seller's quick start to machine-to-machine payments on Hedera. Onboard autonomous AI agents with non-custodial wallets, scaffold Next.js API routes with native HBAR micropayments (x402), and govern agent spending on Hedera right out of the box.

📖 **Documentation:**
- **[Quickstart Guide](docs/getting-started.md)** — Step-by-step setup, agent onboarding, route scaffolding, and spend monitoring.
- **[Architecture Reference](docs/architecture.md)** — System diagrams, smart contracts (`Vault.sol`), HTS precompile `0x167`, and HCS audit topics.

---

## What you can do

- **Onboard AI agents right out of the box:** Dedicated agent-centric onboarding UI and dynamic `/skill.md` auto-discovery are ready to use right out of the box without sharing private keys.
- **Scaffold paid API routes:** Generate x402-gated endpoints with one CLI command (`yarn script:make-route`).
- **Govern agent spending:** Restrict per-task and daily budgets with non-custodial smart contract vaults and human-in-the-loop escalation.
- **Swap facilitators easily:** Switch between public testing (`blocky402.com`) and sovereign self-hosted operation in a flash (`yarn dev:self-hosted`).
- **Audit in real time right out of the box:** Immutably log all payment decisions and agent trust events to Hedera Consensus Service out of the box.

---

## Quickstart

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 20.18.3`
- [Git](https://git-scm.com/)
- [Yarn](https://yarnpkg.com/) (`corepack enable && corepack prepare yarn@stable --activate`)

### Setup in 4 Steps

```bash
# 1. Scaffold project with create-scaffold-hbar (or clone repository)
npm create scaffold-hbar@latest -- --template CijeTheCreator/machine-payments
cd machine-payments
yarn install

# 2. Fund your generated testnet account
# Visit https://portal.hedera.com/faucet and paste the address or Account ID printed during install

# 3. Deploy contracts and consensus topics
yarn script:prepare

# 4. Start the application
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000) to access the **Agent Onboarding** portal, view the **Agent Spend Dashboard** at `/dashboard`, inspect contracts at `/debug`, or verify audit trails at `/verify`.

---

## Testnet Proof

| Artifact | Target Testnet Entity | HashScan Link | What It Proves |
| --- | --- | --- | --- |
| `Vault` Contract | `0.0.10857484`<br>`0xDF555B1adED35fA4cAd6F65182848a0eA8d6766E` | [View on HashScan](https://hashscan.io/testnet/contract/0.0.10857484) | Autonomous spend controls with HTS precompile `0x167` disbursements; over-cap payments revert in consensus |
| `AgentRegistry` Contract | `0.0.10857486`<br>`0x676ABBdD0D53cFBFC1d222E1208Ea9684593E735` | [View on HashScan](https://hashscan.io/testnet/contract/0.0.10857486) | ERC-8004 trustless agent identity registry linking agent addresses to verified DIDs |
| HCS-2 Policy Registry | Topic `0.0.10857494` | [View on HashScan](https://hashscan.io/testnet/topic/0.0.10857494) | Immutable, owner-only versioned policy history and agent spend caps |
| HCS Spend Audit Topic | Topic `0.0.10857493` | [View on HashScan](https://hashscan.io/testnet/topic/0.0.10857493) | Consensus audit trail recording real-time `ALLOW`, `BLOCK`, and `ESCALATE` payment decisions |
| HCS Agent Trust Topic | Topic `0.0.10857496` | [View on HashScan](https://hashscan.io/testnet/topic/0.0.10857496) | Tamper-proof audit log for agent identity registrations and DID authentication receipts |
| Scaffolder Payment (`/api/weather`) | Tx `0.0.6493119@1791134122.243336991` | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.6493119-1791134122-243336991) | Live end-to-end machine x402 payment settlement (1 HBAR) to `Vault` with HCS audit receipt |
| Self-Hosted Facilitator (`/settle`) | Tx `0.0.6493119@1791137849.119166721` | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.6493119-1791137849-119166721) | Sovereign self-hosted facilitator co-signing and direct testnet consensus settlement (1 HBAR) |
| Self-Hosted Facilitator (`/resource`) | Tx `0.0.6493119@1791137851.863823814` | [View on HashScan](https://hashscan.io/testnet/transaction/0.0.6493119-1791137851-863823814) | Full client-to-resource x402 negotiation, verification, and settlement via self-hosted facilitator with authenticated payload unlock |

---

## Developer Commands

### Core Workflows

| Command | Workspace | Description |
| --- | --- | --- |
| `yarn script:prepare` | Root | Checks balance, deploys `Vault` + `AgentRegistry`, creates 3 HCS topics |
| `yarn script:make-route` | Root | Scaffolds an x402-protected App Router endpoint (`--name`, `--price`, `--trust`) |
| `yarn next:dev` | Root | Starts Next.js app in public facilitator mode (`blocky402.com`) |
| `yarn dev:self-hosted` | Root | Starts Next.js app with self-hosted sovereign facilitator route handlers |

### Test, Build and Quality Checks

```bash
yarn test
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
