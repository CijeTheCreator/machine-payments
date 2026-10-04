import { NextRequest, NextResponse } from "next/server";
import { getAgentStore } from "@/services/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = getAgentStore();
    const agents = await store.listAgents();
    return NextResponse.json({ agents });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Failed to list agents" }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    if (!body || typeof body.label !== "string") {
      return NextResponse.json({ error: "Missing required field: label" }, { status: 400 });
    }

    const store = getAgentStore();
    const result = await store.createAgent({
      label: body.label,
      spendLimitHbar: body.spendLimitHbar ? Number(body.spendLimitHbar) : null,
    });

    return NextResponse.json(result, { status: 201 });
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Failed to create agent" }, { status: 500 });
  }
}
