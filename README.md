# Scaffold-HBAR — Agent & Machine Payments

Complete template for autonomous AI agents, machine-to-machine micropayments (x402), non-custodial spend guards, and Hedera Consensus Service audit registries.

📖 **Comprehensive Guide:** See [Quickstart & Architecture Guide](docs/getting-started.md) for full setup instructions, GIF walkthroughs, and technical specifications.

## What's in this template

- **30-Second Rapid Onboarding:** Auto-provisions Hedera testnet keypairs and funds agent accounts via zero-config serverless micro-dispenser (`yarn script:fund-agent`).
- **Protected Route Code Scaffolder (`script:make-route`):** Artisan-style CLI generator for instant Next.js App Router x402-gated endpoints.
- **Multi-Tier Spend Guard Engine:** L0 pre-flight, L1 rolling budgets, L2 `Vault.sol` consensus caps, and HIP-423 HITL scheduled transaction escalation.
- **Dual-Flavor x402 Facilitators:** Instant public testnet negotiation (`yarn next:dev`) and self-hosted sovereign Next.js route handlers (`yarn dev:self-hosted`).
- **Tamper-Proof Audit Logging:** HCS audit topic (`agent-spend-audit`) and HCS-2 versioned policy registry.
- **100% Offline Test Suite:** Unit and integration tests that run completely offline (`yarn test`).

## Work from this repository

This branch uses Yarn workspaces, so clone-and-run needs Yarn. Apps created with the CLI can use Yarn (default) or npm; see the [docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index).

### Prerequisites

- [Node.js](https://nodejs.org/) ≥ 20.18.3
- [Git](https://git-scm.com/) with `user.name` and `user.email` configured
- [Yarn](https://yarnpkg.com/) (default; required if you clone this repo) or npm if you scaffolded with the CLI. For Yarn, install via Corepack:
  ```bash
  corepack enable && corepack prepare yarn@stable --activate
  ```
- **If using Foundry:** [Foundry](https://book.getfoundry.sh/getting-started/installation) (`forge`, `cast`, `anvil`)

### Quick start

```bash
yarn install

# Auto-provision autonomous agent testnet account & keypair
yarn script:fund-agent
# (Or generate offline keypair: yarn script:create-agent)

# Run offline unit & smoke tests
yarn hardhat:test
yarn test:smoke

# Terminal 1: local Hedera-forked node
yarn hardhat:chain

# Terminal 2: deploy to that node (8545)
yarn hardhat:deploy --network localhost

# Terminal 3: Next.js app
yarn next:dev
```

Open [http://localhost:3000](http://localhost:3000) and use the **Debug Contracts** page.

Frontend only (no local chain):

```bash
yarn install
yarn next:dev
```

`yarn hardhat:deploy` without `--network localhost` targets the in-process `hardhat` network, not the long-running fork. Local Hardhat and Foundry workflows are in [`packages/hardhat/README.md`](packages/hardhat/README.md) and [`packages/foundry/README.md`](packages/foundry/README.md). Deploy and verify on testnet/mainnet: [Hedera docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index#deploying-to-testnet).

## Project layout

- **packages/hardhat** — Hardhat config, contracts, `deploy/` scripts, tests
- **packages/foundry** — Forge config, contracts, `script/` deploy scripts, tests
- **packages/nextjs** — Next.js app, RainbowKit, wagmi, scaffold config

Network and RPC URLs are in `packages/hardhat/hardhat.config.ts` and `packages/foundry/foundry.toml` respectively.

## Links

- [Scaffold HBAR docs](https://docs.hedera.com/solutions/tools/scaffold-hbar/index)
- [create-scaffold-hbar](https://github.com/hedera-dev/create-scaffold-hbar) — CLI
- [Hedera Portal faucet](https://portal.hedera.com/faucet)
- [HashScan](https://hashscan.io/)
