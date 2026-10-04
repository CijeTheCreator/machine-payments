# Demo Video Recording Flow: Scaffold-HBAR Agent & Machine Payments

A concise, high-impact guide for recording a 2.5 to 3-minute product demo video demonstrating the end-to-end machine payments lifecycle on Hedera.

---

## Pre-Recording Checklist

- [ ] **Browser Tabs Prepared (Full Screen or 1080p, Light/Dark Mode consistent):**
  - Tab 1: `http://localhost:3000` (Agent Onboarding Portal)
  - Tab 2: `http://localhost:3000/skill.md` (Machine Discovery Endpoint)
  - Tab 3: `http://localhost:3000/dashboard` (Agent Spend Dashboard)
  - Tab 4: `https://hashscan.io/testnet` (Hedera Testnet HashScan)
- [ ] **Terminal Windows Prepared:**
  - Terminal 1: Application server running (`yarn next:dev` or `yarn dev:self-hosted`)
  - Terminal 2: Interactive CLI for scaffolding, testing, and agent execution
- [ ] **Environment Ready:**
  - Testnet account funded via Hedera Portal faucet (`https://portal.hedera.com/faucet`)
  - Contracts and HCS topics initialized via `yarn script:prepare`

---

## Scene-by-Scene Recording Script

### Scene 1: The Hook & Scaffolding (0:00 – 0:35)

- **Screen:** Terminal 2 (clean prompt)
- **Action:**
  1. Show the official scaffolder command:
     ```bash
     npm create scaffold-hbar@latest -- --template CijeTheCreator/machine-payments
     ```
  2. Briefly show the repository structure and run:
     ```bash
     yarn script:prepare
     ```
     Highlight the automated balance verification, `Vault.sol` & `AgentRegistry.sol` deployments to Hedera testnet, and the 3 Hedera Consensus Service (HCS) topics created (Spend Audit, Trust Audit, and HCS-2 Policy Registry).
- **Voiceover / Captions:**
  > "Scaffold-HBAR Agent & Machine Payments gives sellers a turnkey starter to monetize API routes with native HBAR micropayments, safely onboard autonomous AI agents, and enforce on-chain spending guardrails right out of the box."

---

### Scene 2: Agent-Centric Onboarding & Discovery (0:35 – 1:05)

- **Screen:** Browser Tab 1 (`http://localhost:3000/onboard`) -> Browser Tab 2 (`/skill.md`)
- **Action:**
  1. Show the dedicated **Agent Onboarding** portal.
  2. Enter an agent label (e.g. `Research-Agent-01`), set a spend cap of `5 HBAR`, and click **Generate Claim Link**.
  3. Show the generated copyable agent directive:
     ```
     Install the skill from http://localhost:3000/skill.md, then follow its instructions to onboard with claim code <claimCode>
     ```
  4. Explain that the agent is instructed to install the skill first, then onboard with non-custodial keys using Open Wallet Standard (no private keys ever shared).
  5. Switch to Tab 2 (`/skill.md`) to show the machine-readable skill manifest: wallet initialization, claim procedure, and active endpoint catalog.
- **Voiceover / Captions:**
  > "Onboarding is ready right out of the box with an agent-centric UI. The portal instructs the agent to install the skill first, then onboard with claim credentials. Powered by Open Wallet Standard, the agent derives its keys locally so private keys never leave the agent."

---

### Scene 3: Scaffolding a Paid Route with CLI (1:05 – 1:35)

- **Screen:** Terminal 2 -> Browser Tab 2 (`/skill.md`) -> Code Editor
- **Action:**
  1. Run the route generator with a resource description:
     ```bash
     yarn script:make-route --name sentiment --price 0.5 --description "Real-time AI sentiment analysis" --trust
     ```
  2. Show that `make-route` automatically creates `packages/nextjs/app/api/sentiment/route.ts` with the 3-tier middleware onion:
     - `withAgentTrust`: ERC-8004 DID validation
     - `withX402`: Payment challenge negotiation and micro-settlement
     - `withSpendGuard`: Budget limits, atomic holds, and HCS consensus audit
  3. Refresh `/skill.md` in Browser Tab 2: show that the new `/api/sentiment` route, its 0.5 HBAR price, and description are now dynamically listed for agents to discover.
- **Voiceover / Captions:**
  > "Monetizing an API takes one command. The CLI scaffolder generates a Next.js App Router endpoint pre-wired with agent identity verification, x402 payment challenge negotiation, and spend guardrails. It also immediately registers the route and description in `/skill.md` so agents discover it instantly."

---

### Scene 4: Autonomous Agent Invocation & x402 Micropayment (1:35 – 2:10)

- **Screen:** Terminal 2 / Agent prompt interface (Split screen with Browser Tab 3: `/dashboard`)
- **Action:**
  1. Prompt the agent: *"Fetch market sentiment from /api/sentiment"*.
  2. The agent uses its installed skill, discovers the route and price from `/skill.md`, and calls the endpoint.
  3. Show the autonomous negotiation:
     - The endpoint responds with `HTTP 402 Payment Required` and the `PAYMENT-REQUIRED` challenge header (50,000,000 tinybars).
     - The agent verifies the price against its budget cap, signs the `TransferTransaction` non-custodially, and retries with `PAYMENT-SIGNATURE`.
     - The endpoint returns `HTTP 200 OK` with the sentiment payload and settlement receipt.
  4. Highlight that developers can switch between public testing (`blocky402.com`) and sovereign self-hosted facilitator mode in a flash.
- **Voiceover / Captions:**
  > "Now the operator prompts the agent to use the service. Having installed the skill during onboarding, the agent discovers the route details, handles the 402 challenge, signs the native HBAR micropayment, and receives the authenticated payload autonomously."

---

### Scene 5: Spend Dashboard & Real-Time Consensus Audit (2:10 – 2:40)

- **Screen:** Browser Tab 3 (`http://localhost:3000/dashboard`) -> HashScan Tab
- **Action:**
  1. Show the **Agent Spend Dashboard**:
     - Real-time spend KPIs (24h Spend, 7d Spend, Active Agents).
     - Active agent table with live mirror node balances.
     - Recent settlements list with the transaction that was just executed.
  2. Click a HashScan receipt link to show the live testnet transaction on [HashScan](https://hashscan.io/testnet).
  3. Show the HCS spend audit topic recording the consensus receipt with `ALLOW`.
- **Voiceover / Captions:**
  > "For buyers and agent operators, the dashboard is set up out of the box to monitor balances and enforce hard budget caps. Every transaction is immutably logged to Hedera Consensus Service, giving you a real-time, tamper-proof audit trail with live HashScan receipts."

---

### Scene 6: 100% Offline Test Suite & Outro (2:40 – 3:00)

- **Screen:** Terminal 2
- **Action:**
  1. Run the offline test suite:
     ```bash
     yarn test
     ```
  2. Show all unit tests passing in seconds without any network connection or testnet funds.
- **Voiceover / Captions:**
  > "Best of all, the entire test suite runs 100% offline—validating smart contract vaults, spend guards, and facilitator flows with zero external dependencies. Scaffold your agent payments project today with Scaffold-HBAR."

---

## Quick Reference Commands for Recording

| Step | Command Line |
| --- | --- |
| **Scaffold** | `npm create scaffold-hbar@latest -- --template CijeTheCreator/machine-payments` |
| **Prepare** | `yarn script:prepare` |
| **Dev Server** | `yarn next:dev` |
| **Self-Hosted Mode** | `yarn dev:self-hosted` |
| **Make Route** | `yarn script:make-route --name sentiment --price 0.5 --description "Real-time AI sentiment analysis" --trust` |
| **Offline Tests** | `yarn test` |
| **Quality Gate** | `yarn lint && yarn next:check-types && yarn hardhat:check-types` |
