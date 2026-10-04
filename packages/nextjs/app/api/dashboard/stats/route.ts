import { NextResponse } from "next/server";
import { getAgentStore } from "@/services/agents";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const store = getAgentStore();
    const stats = await store.getDashboardStats();
    return NextResponse.json(stats);
  } catch (error) {
    return NextResponse.json({ error: (error as Error).message || "Failed to fetch dashboard stats" }, { status: 500 });
  }
}
