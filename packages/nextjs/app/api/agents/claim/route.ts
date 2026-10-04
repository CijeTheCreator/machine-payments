import { NextRequest, NextResponse } from "next/server";
import { getAgentStore } from "@/services/agents";
import { fetchHederaAccountBalance } from "@/utils/hederaBalance";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body.claim !== "string") {
      return NextResponse.json({ error: "Missing required field: claim" }, { status: 400 });
    }

    const store = getAgentStore();
    const result = await store.claimAgent({
      claim: body.claim,
      walletAddress: body.walletAddress || body.wallet || null,
      accountId: body.accountId || null,
      did: body.did || null,
    });

    // Check on-chain balance to immediately promote state if already funded
    const lookupTarget = result.agent.accountId || result.agent.walletAddress;
    if (lookupTarget) {
      const balance = await fetchHederaAccountBalance(lookupTarget);
      if (parseFloat(balance.hbar) > 0) {
        await store.updateAgent(result.agent.id, { state: "funded" });
        result.agent.state = "funded";
      } else {
        await store.updateAgent(result.agent.id, { state: "awaiting_funding" });
        result.agent.state = "awaiting_funding";
      }
    }

    return NextResponse.json(result, { status: 200 });
  } catch (error) {
    const msg = (error as Error).message || "Failed to claim agent";
    const status = msg.includes("Invalid") || msg.includes("expired") ? 400 : 500;
    return NextResponse.json({ error: msg }, { status });
  }
}
