import { NextRequest, NextResponse } from "next/server";
import { getAgentStore } from "@/services/agents";
import { fetchHederaAccountBalance } from "@/utils/hederaBalance";

export const dynamic = "force-dynamic";

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body.apiKey !== "string" || !body.apiKey.trim()) {
      return NextResponse.json({ error: "Missing required field: apiKey" }, { status: 400 });
    }

    const store = getAgentStore();
    const agent = await store.getAgentByApiKey(body.apiKey.trim());

    if (!agent) {
      return NextResponse.json({ error: "Invalid agent API key" }, { status: 401 });
    }

    let balance = { hbar: "0", tinybar: "0" };
    const lookupTarget = agent.accountId || agent.walletAddress;
    if (lookupTarget) {
      balance = await fetchHederaAccountBalance(lookupTarget);
    }

    return NextResponse.json({
      success: true,
      agent,
      balance,
    });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Authentication failed" }, { status: 500 });
  }
}
