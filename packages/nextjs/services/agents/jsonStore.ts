import {
  AgentClaim,
  AgentRecord,
  AgentState,
  AgentStore,
  ClaimAgentInput,
  ClaimAgentResult,
  CreateAgentInput,
  DashboardStats,
  SpendEvent,
} from "./types";
import crypto from "crypto";
import fs from "fs";
import path from "path";

interface StoreData {
  agents: AgentRecord[];
  spends: SpendEvent[];
}

export class JsonAgentStore implements AgentStore {
  private filePath: string;
  private data: StoreData = { agents: [], spends: [] };
  private initialized = false;

  constructor(filePath?: string) {
    this.filePath = filePath || process.env.AGENT_STORE_PATH || path.join(process.cwd(), "data", "agents.json");
  }

  private ensureLoaded(): void {
    if (this.initialized) return;
    this.initialized = true;

    try {
      if (fs.existsSync(this.filePath)) {
        const raw = fs.readFileSync(this.filePath, "utf-8");
        this.data = JSON.parse(raw);
        if (!Array.isArray(this.data.agents)) this.data.agents = [];
        if (!Array.isArray(this.data.spends)) this.data.spends = [];
      } else {
        this.data = { agents: [], spends: [] };
      }
    } catch {
      this.data = { agents: [], spends: [] };
    }
  }

  private persist(): void {
    try {
      const dir = path.dirname(this.filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
      }
      const tmpPath = `${this.filePath}.${Date.now()}.${crypto.randomBytes(4).toString("hex")}.tmp`;
      fs.writeFileSync(tmpPath, JSON.stringify(this.data, null, 2), { mode: 0o600 });
      fs.renameSync(tmpPath, this.filePath);
    } catch {
      // Best-effort in serverless or read-only environments
    }
  }

  private hashKey(key: string): string {
    return crypto.createHash("sha256").update(key).digest("hex");
  }

  async createAgent(input: CreateAgentInput): Promise<{ agent: AgentRecord; claimCode: string }> {
    this.ensureLoaded();
    const id = `agent_${crypto.randomBytes(8).toString("hex")}`;
    const claimCode = `claim_${crypto.randomBytes(12).toString("hex")}`;
    const now = new Date().toISOString();

    const claim: AgentClaim = {
      code: claimCode,
      expiresAt: Date.now() + 24 * 60 * 60 * 1000, // 24 hours TTL
    };

    const agent: AgentRecord = {
      id,
      label: input.label.trim() || "Unnamed Agent",
      apiKeyHash: null,
      claim,
      walletAddress: null,
      accountId: null,
      did: null,
      state: "minted",
      spendLimitHbar: input.spendLimitHbar ?? null,
      totalSpentTinybar: "0",
      createdAt: now,
      updatedAt: now,
    };

    this.data.agents.unshift(agent);
    this.persist();

    return { agent, claimCode };
  }

  async claimAgent(input: ClaimAgentInput): Promise<ClaimAgentResult> {
    this.ensureLoaded();
    const agentIndex = this.data.agents.findIndex(a => a.claim && a.claim.code === input.claim);

    if (agentIndex === -1) {
      throw new Error("Invalid or expired claim code");
    }

    const agent = this.data.agents[agentIndex];
    if (agent.claim && agent.claim.expiresAt < Date.now()) {
      throw new Error("Claim code has expired");
    }

    const apiKey = `mmp_live_${crypto.randomBytes(24).toString("hex")}`;
    const apiKeyHash = this.hashKey(apiKey);
    const now = new Date().toISOString();

    let state: AgentState = "initializing";
    if (input.walletAddress || input.accountId) {
      state = "wallet";
    }

    const updatedAgent: AgentRecord = {
      ...agent,
      apiKeyHash,
      claim: null, // one-time claim consumed
      walletAddress: input.walletAddress ?? agent.walletAddress,
      accountId: input.accountId ?? agent.accountId,
      did: input.did ?? agent.did,
      state,
      updatedAt: now,
    };

    this.data.agents[agentIndex] = updatedAgent;
    this.persist();

    return { apiKey, agent: updatedAgent };
  }

  async getAgent(id: string): Promise<AgentRecord | null> {
    this.ensureLoaded();
    return this.data.agents.find(a => a.id === id) ?? null;
  }

  async getAgentByApiKey(apiKey: string): Promise<AgentRecord | null> {
    this.ensureLoaded();
    const hash = this.hashKey(apiKey);
    return this.data.agents.find(a => a.apiKeyHash === hash) ?? null;
  }

  async getAgentByClaim(claimCode: string): Promise<AgentRecord | null> {
    this.ensureLoaded();
    return this.data.agents.find(a => a.claim && a.claim.code === claimCode) ?? null;
  }

  async updateAgent(
    id: string,
    updates: Partial<Pick<AgentRecord, "state" | "walletAddress" | "accountId" | "did" | "spendLimitHbar">>,
  ): Promise<AgentRecord | null> {
    this.ensureLoaded();
    const idx = this.data.agents.findIndex(a => a.id === id);
    if (idx === -1) return null;

    const existing = this.data.agents[idx];
    const filteredUpdates: Record<string, any> = {};
    for (const [k, v] of Object.entries(updates)) {
      if (v !== undefined) filteredUpdates[k] = v;
    }
    const updated: AgentRecord = {
      ...existing,
      ...filteredUpdates,
      updatedAt: new Date().toISOString(),
    };

    this.data.agents[idx] = updated;
    this.persist();
    return updated;
  }

  async listAgents(): Promise<AgentRecord[]> {
    this.ensureLoaded();
    return [...this.data.agents];
  }

  async recordSpend(eventInput: Omit<SpendEvent, "id" | "timestamp">): Promise<SpendEvent> {
    this.ensureLoaded();
    const id = `spend_${crypto.randomBytes(8).toString("hex")}`;
    const timestamp = Date.now();

    const event: SpendEvent = {
      id,
      timestamp,
      ...eventInput,
    };

    this.data.spends.unshift(event);

    // Update agent's totalSpentTinybar
    const agentIdx = this.data.agents.findIndex(a => a.id === eventInput.agentId);
    if (agentIdx !== -1) {
      const current = BigInt(this.data.agents[agentIdx].totalSpentTinybar || "0");
      const add = BigInt(eventInput.amountTinybar || "0");
      this.data.agents[agentIdx].totalSpentTinybar = (current + add).toString();
      this.data.agents[agentIdx].updatedAt = new Date().toISOString();
    }

    this.persist();
    return event;
  }

  async getDashboardStats(): Promise<DashboardStats> {
    this.ensureLoaded();
    const now = Date.now();
    const DAY_MS = 24 * 60 * 60 * 1000;
    const WEEK_MS = 7 * DAY_MS;

    const in24h = this.data.spends.filter(s => now - s.timestamp <= DAY_MS);
    const in7d = this.data.spends.filter(s => now - s.timestamp <= WEEK_MS);

    const spend24hTiny = in24h.reduce((sum, s) => sum + BigInt(s.amountTinybar || "0"), 0n);
    const spend7dTiny = in7d.reduce((sum, s) => sum + BigInt(s.amountTinybar || "0"), 0n);

    const spend24hHbar = (Number(spend24hTiny) / 1e8).toFixed(4);
    const spend7dHbar = (Number(spend7dTiny) / 1e8).toFixed(4);

    const activeAgents = this.data.agents.filter(a => a.state === "active" || a.state === "funded").length;

    // Daily buckets for chart (last 14 days)
    const chartData: Array<{ date: string; spendHbar: number; count: number }> = [];
    for (let i = 13; i >= 0; i--) {
      const startOfDay = new Date(now - i * DAY_MS);
      startOfDay.setUTCHours(0, 0, 0, 0);
      const startMs = startOfDay.getTime();
      const endMs = startMs + DAY_MS;

      const daySpends = this.data.spends.filter(s => s.timestamp >= startMs && s.timestamp < endMs);
      const totalDayTiny = daySpends.reduce((sum, s) => sum + BigInt(s.amountTinybar || "0"), 0n);

      chartData.push({
        date: startOfDay.toLocaleDateString("en-US", { month: "short", day: "numeric" }),
        spendHbar: Number((Number(totalDayTiny) / 1e8).toFixed(3)),
        count: daySpends.length,
      });
    }

    // Top agents by spend
    const agentSpendMap = new Map<string, bigint>();
    for (const s of in7d) {
      const prev = agentSpendMap.get(s.agentId) || 0n;
      agentSpendMap.set(s.agentId, prev + BigInt(s.amountTinybar || "0"));
    }

    const topAgents = [...agentSpendMap.entries()]
      .sort((a, b) => (b[1] > a[1] ? 1 : -1))
      .slice(0, 5)
      .map(([agentId, spentTiny]) => {
        const agent = this.data.agents.find(a => a.id === agentId);
        return {
          id: agentId,
          label: agent?.label ?? "Unknown Agent",
          spentHbar: (Number(spentTiny) / 1e8).toFixed(4),
        };
      });

    return {
      spend24hTinybar: spend24hTiny.toString(),
      spend24hHbar,
      spend7dTinybar: spend7dTiny.toString(),
      spend7dHbar,
      activeAgents,
      totalAgents: this.data.agents.length,
      totalRequests: this.data.spends.length,
      chartData,
      recentActivity: this.data.spends.slice(0, 15),
      topAgents,
    };
  }

  async clearAll(): Promise<void> {
    this.data = { agents: [], spends: [] };
    this.persist();
  }
}
