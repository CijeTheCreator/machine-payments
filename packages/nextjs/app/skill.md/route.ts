import { NextRequest, NextResponse } from "next/server";
import fs from "fs";
import path from "path";

export const dynamic = "force-dynamic";

interface RouteManifestEntry {
  name: string;
  path: string;
  priceHbar: number;
  priceTinybar: string;
  description: string;
  trust?: boolean;
  guard?: boolean;
}

const defaultRoutes: RouteManifestEntry[] = [
  {
    name: "weather",
    path: "/api/weather",
    priceHbar: 1,
    priceTinybar: "100000000",
    description: "Current weather forecast data and climate conditions",
    trust: true,
    guard: true,
  },
  {
    name: "resource",
    path: "/api/x402/resource",
    priceHbar: 1,
    priceTinybar: "100000000",
    description: "Protected premium microservice resource",
    trust: false,
    guard: true,
  },
];

function getRoutes(): RouteManifestEntry[] {
  try {
    const cwd = process.cwd();
    const candidatePaths = [
      path.resolve(cwd, "app/routes-manifest.json"),
      path.resolve(cwd, "packages/nextjs/app/routes-manifest.json"),
    ];

    for (const p of candidatePaths) {
      if (fs.existsSync(p)) {
        const raw = fs.readFileSync(p, "utf-8");
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
    }
  } catch {
    // Return fallback defaults on error
  }
  return defaultRoutes;
}

export async function GET(req: NextRequest) {
  // Determine site origin dynamically from incoming request headers
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "localhost:3000";
  const proto = req.headers.get("x-forwarded-proto") || "http";
  const origin = `${proto}://${host}`;

  const routes = getRoutes();
  const routesTable = routes
    .map(
      r =>
        `| \`${r.path}\` | \`${r.priceHbar} HBAR\` | \`${r.priceTinybar}\` | ${r.description} | ${
          r.trust ? "Required (ERC-8004)" : "Public"
        } |`,
    )
    .join("\n");

  const sampleRoute = routes[0]?.path || "/api/x402/resource";

  const skillContent = `# Scaffold-HBAR Agent & Machine Payments — Agent Skill

You are an autonomous AI client agent integrating with an x402-monetized Hedera merchant service hosted at ${origin}.
This document instructs you on how to initialize your non-custodial wallet using the Open Wallet Standard (OWS), redeem your one-time claim code, verify testnet funding, and invoke pay-per-request endpoints.

---

## 1. What Your Operator Gives You

Your operator provides you with a single onboarding directive containing a one-time claim code:

\`\`\`
Install the skill from ${origin}/skill.md, then follow its instructions to onboard with claim code <CLAIM_CODE>
\`\`\`

**Security Guarantee:** No raw private keys or permanent API tokens are ever passed into chat or prompt transcripts. The \`claim_...\` string is single-use and expires in 24 hours.

---

## 2. Onboarding Steps (Execute in Agent Context)

### Step 2.1: Initialize Non-Custodial OWS Keystore
Create an encrypted Hedera secp256k1 keypair on your local machine using Open Wallet Standard (OWS):

\`\`\`bash
# Create local encrypted wallet
ows wallet create --network testnet
\`\`\`

If \`ows\` CLI is not installed, derive an ECDSA secp256k1 keypair locally. Your private keys must remain strictly in your local encrypted keystore and **never** be transmitted over HTTP or logged.

### Step 2.2: Trade Claim Code for Permanent API Token
Redeem your one-time claim code by registering your Hedera Account ID and EVM address with the merchant:

\`\`\`bash
curl -X POST "${origin}/api/agents/claim" \\
  -H "Content-Type: application/json" \\
  -d '{
    "claim": "<CLAIM_CODE>",
    "walletAddress": "<YOUR_EVM_ADDRESS>",
    "accountId": "<YOUR_ACCOUNT_ID>",
    "did": "did:hedera:testnet:<YOUR_ACCOUNT_ID>"
  }'
\`\`\`

The server returns:
- \`apiKey\`: Your permanent bearer credential (\`mmp_live_...\`). Save this locally with \`0600\` file permissions.
- \`agent.id\`: Your unique agent identifier.
- \`agent.state\`: Current lifecycle status (\`wallet\`, \`awaiting_funding\`, \`funded\`, or \`active\`).

---

## 3. Funding Instructions (Hedera Testnet)

If your agent status returns \`awaiting_funding\`, your account requires testnet HBAR to settle x402 micropayments.

1. **Check Balance via Mirror Node:**
   \`\`\`bash
   curl -s "https://testnet.mirrornode.hedera.com/api/v1/accounts/<YOUR_ACCOUNT_ID>" | jq '.balance'
   \`\`\`

2. **Operator Action:**
   If your balance is \`0\`, instruct your operator:
   > *"Agent wallet (<YOUR_ACCOUNT_ID>) requires testnet HBAR. Please fund this account via the official Hedera Portal Faucet at https://portal.hedera.com/faucet"*

Once funded, the merchant's backend will detect your balance via Hedera Mirror Node polling and automatically promote your status to \`funded\` / \`active\`.

---

## 4. Invoking Protected x402 Endpoints

The following monetized endpoints are currently active and discoverable on this service:

| Endpoint | Price (HBAR) | Price (tinybars) | Description | Agent Trust |
| --- | --- | --- | --- | --- |
${routesTable}

### Example Call

When invoking monetized service routes, include your agent credentials in the request headers:

\`\`\`bash
curl -X GET "${origin}${sampleRoute}" \\
  -H "X-Agent-ID: <YOUR_AGENT_ID>" \\
  -H "Authorization: Bearer <YOUR_API_KEY>"
\`\`\`

- If unpaid, the endpoint responds with standard HTTP \`402 Payment Required\` specifying the price in tinybars (1 HBAR = 10^8 tinybar).
- Payments settle through the merchant's x402 facilitator with tamper-proof Hedera Consensus Service (HCS) audit receipts.

---

## 5. Live Spend Telemetry

Your operator can monitor your spending caps, budget ceiling meters, and testnet consensus receipts in real time on the dashboard:
👉 **${origin}/dashboard**
`;

  return new NextResponse(skillContent, {
    status: 200,
    headers: {
      "Content-Type": "text/markdown; charset=utf-8",
      "Cache-Control": "no-cache, no-store, must-revalidate",
    },
  });
}
