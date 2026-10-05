# Quickstart Guide: Agent & Machine Payments

A seller's quick start to machine-to-machine payments on Hedera. Onboard autonomous AI agents with non-custodial wallets, scaffold Next.js API routes with native HBAR micropayments (x402), and govern agent spending on Hedera right out of the box.

Looking for system diagrams, precompiles, or contract internals? See the [Technical Architecture Reference](architecture.md).

---

## Start your environment

**How do I run the template locally?**

Set up your local development environment and deploy required testnet infrastructure in 4 commands.

### Prerequisites

- [Node.js](https://nodejs.org/) `>= 20.18.3`
- [Yarn](https://yarnpkg.com/) (`corepack enable && corepack prepare yarn@stable --activate`)
- Git configured with `user.name` and `user.email`

### Setup

```bash
# 1. Scaffold project using official create-scaffold-hbar
npm create scaffold-hbar@latest -- --template CijeTheCreator/machine-payments
cd machine-payments
yarn install
```

![Initial Scaffold](/docs/assets/initial-scaffold.gif)

```bash
# 2. Fund your generated testnet account
# Visit https://portal.hedera.com/faucet and paste the EVM address or Account ID printed during install

# 3. Deploy contracts and consensus topics
yarn script:prepare

# 4. Start the application
yarn next:dev
```

Run one command to deploy your contracts and consensus topics:

![Prepare](/docs/assets/prepare.gif)

Your contracts are deployed on Hedera testnet and local configuration is synchronized.

> [!IMPORTANT]
> You must fund your account via the faucet before running `yarn script:prepare`. The script verifies your account balance on the mirror node before deploying.

---

## Onboard autonomous agents

**How do I onboard agents and expose services?**

Running the scaffold gives you the complete agent-centric onboarding UI, claim flow, and dynamic `/skill.md` discovery right out of the box. Autonomous agents discover your endpoints and register without sharing private keys.

1. Open [http://localhost:3000/onboard](http://localhost:3000/onboard).
2. Enter an agent label, set an optional spend cap, and click **Generate Claim Link**.
3. Send the generated link or claim code to the agent.

Create a claim code in the merchant portal and send the link to your agent:

![Onboarding](/docs/assets/onboarding.gif)

The agent registers its wallet and appears in your agent registry.

> [!NOTE]
> Agent key management uses Open Wallet Standard. Learn more at [https://openwallet.sh](https://openwallet.sh).

> [!IMPORTANT]
> Claim codes expire after 24 hours. No private keys are ever shared with or stored by the agent onboarding portal.

### Machine discovery via `/skill.md`

Autonomous agents read `<your-url>/skill.md` out of the box to discover available paid routes, price quotes, and payment challenge formats automatically.

> [!NOTE]
> In development, this is available at `http://localhost:3000/skill.md`.

When an agent connects, it claims its allowance via `POST /api/agents/claim` and signs subsequent x402 payment challenges autonomously.

---

## Scaffold a paid route

**How do I scaffold a paid route with micropayments, trust verification, and spend guards?**

Generate a ready-to-run Next.js App Router endpoint gated by x402 payment challenges, ERC-8004 agent trust, and spend guardrails with a single command.

```bash
yarn script:make-route --name inference --price 0.5 --trust
```

Generate an x402-gated API endpoint with one command:

![Make](/docs/assets/make.gif)

The endpoint immediately rejects unpaid requests with an HTTP 402 challenge.

### What you get

The scaffolder creates `packages/nextjs/app/api/sentiment/route.ts` with payment challenge negotiation, agent trust, and spend guardrails already wired:

```typescript
import { NextResponse } from "next/server";
import { withAgentTrust } from "~~/services/trust";
import { withX402 } from "~~/services/facilitator";
import { withSpendGuard } from "~~/services/guard";

// 0.5 HBAR = 50,000,000 tinybars
const PRICE_TINYBAR = "50000000";
const PAY_TO =
  process.env.NEXT_PUBLIC_VAULT_ADDRESS ||
  process.env.AGENT_ACCOUNT_ID ||
  "0.0.X";

const sentimentHandler = async (
  req: Request,
  { payment, guard, agent }: any,
) => {
  // Add your monetization logic here.
  // This code only runs after the client completes the payment challenge.
  return NextResponse.json({
    success: true,
    data: { sentiment: "bullish", confidence: 0.98 },
  });
};

export const GET = withAgentTrust(
  withX402(
    withSpendGuard(sentimentHandler, { maxPriceHbar: 10, recordAudit: true }),
    { priceTinybar: PRICE_TINYBAR, payTo: PAY_TO, memo: "x402-sentiment" },
  ),
);
```

> [!NOTE]
> Revenue routes directly to your Vault contract if deployed, or falls back to your seller operator account.

---

## Call a paid route with x402

**How do clients pay for API requests without an API key?**

Clients pay on demand using native HBAR over standard HTTP headers.

```bash
# 1. Request the protected resource
curl -i http://localhost:3000/api/sentiment
```

The server returns an HTTP 402 challenge:

```http
HTTP/1.1 402 Payment Required
PAYMENT-REQUIRED: {"priceTinybar":"50000000","payTo":"0.0.12345","network":"hedera-testnet","memo":"x402-sentiment"}
```

The client signs a transfer transaction for 50,000,000 tinybars (0.5 HBAR) and retries:

```bash
# 2. Submit the signed payment header
curl -i http://localhost:3000/api/sentiment \
  -H "PAYMENT-SIGNATURE: <base64-signed-transaction>"
```

Make a request to a protected endpoint:

![402Flow](/docs/assets/402flow.gif)

The client signs the 402 challenge and receives the paid response instantly.

> [!NOTE]
> Public testnet settlement via `blocky402.com` is active by default. To settle using your own sovereign local facilitator, start your server with `yarn dev:self-hosted`.

---

## Monitor and guard agent spending

**How do buyers track and control agent spending?**

The dashboard is already set up out of the box for buyers (owners of the agents) to track and control agent spending in real time at [http://localhost:3000/dashboard](http://localhost:3000/dashboard).

Track agent spend and verify consensus settlement receipts in real-time:

![Dashboard](/docs/assets/dashboard.gif)

Transactions exceeding spend limits escalate to human signers via HIP-423 scheduled transactions.

### What buyers see on the dashboard

- **Agent KPIs:** 24h spend in HBAR, 7-day totals, and active agent counts.
- **Agent Balances:** Live testnet balances polled directly from the mirror node.
- **HashScan Links:** Clickable consensus receipts for every settled micropayment.
- **Budget Escalation:** If an agent attempts to spend more than its assigned limit, the transaction halts and creates a scheduled transaction requiring human approval.
