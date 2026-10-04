import { NextRequest, NextResponse } from "next/server";
import { getAgentStore } from "@/services/agents";
import { fetchHederaAccountBalance } from "@/utils/hederaBalance";

export const dynamic = "force-dynamic";

export async function GET(_req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const store = getAgentStore();
    const agent = await store.getAgent(id);

    if (!agent) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    // Refresh balance and state if wallet exists
    let balance = { hbar: "0", tinybar: "0" };
    const lookupTarget = agent.accountId || agent.walletAddress;
    if (lookupTarget) {
      balance = await fetchHederaAccountBalance(lookupTarget);
      if (parseFloat(balance.hbar) > 0 && (agent.state === "awaiting_funding" || agent.state === "wallet")) {
        await store.updateAgent(agent.id, { state: "funded" });
        agent.state = "funded";
      }
    }

    return NextResponse.json({ agent, balance });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Failed to fetch agent" }, { status: 500 });
  }
}

export async function PATCH(req: NextRequest, props: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await props.params;
    const body = await req.json();
    const store = getAgentStore();

    const updates: Record<string, any> = {};
    if (body.state !== undefined) updates.state = body.state;
    if (body.walletAddress !== undefined) updates.walletAddress = body.walletAddress;
    if (body.accountId !== undefined) updates.accountId = body.accountId;
    if (body.did !== undefined) updates.did = body.did;
    if (body.spendLimitHbar !== undefined) updates.spendLimitHbar = Number(body.spendLimitHbar);

    const updated = await store.updateAgent(id, updates);

    if (!updated) {
      return NextResponse.json({ error: "Agent not found" }, { status: 404 });
    }

    return NextResponse.json({ agent: updated });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Failed to update agent" }, { status: 500 });
  }
}
