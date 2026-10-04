export type AgentState = "minted" | "initializing" | "wallet" | "awaiting_funding" | "funded" | "active";

export interface AgentClaim {
  code: string;
  expiresAt: number;
}

export interface AgentRecord {
  id: string;
  label: string;
  apiKeyHash: string | null;
  claim: AgentClaim | null;
  walletAddress: string | null;
  accountId: string | null;
  did: string | null;
  state: AgentState;
  spendLimitHbar: number | null;
  totalSpentTinybar: string;
  createdAt: string;
  updatedAt: string;
}

export interface SpendEvent {
  id: string;
  agentId: string;
  agentLabel: string;
  route: string;
  amountTinybar: string;
  amountHbar: string;
  txId: string | null;
  hcsSequenceNumber: string | null;
  timestamp: number;
}

export interface CreateAgentInput {
  label: string;
  spendLimitHbar?: number | null;
}

export interface ClaimAgentInput {
  claim: string;
  walletAddress?: string | null;
  accountId?: string | null;
  did?: string | null;
}

export interface ClaimAgentResult {
  apiKey: string;
  agent: AgentRecord;
}

export interface DashboardStats {
  spend24hTinybar: string;
  spend24hHbar: string;
  spend7dTinybar: string;
  spend7dHbar: string;
  activeAgents: number;
  totalAgents: number;
  totalRequests: number;
  chartData: Array<{ date: string; spendHbar: number; count: number }>;
  recentActivity: SpendEvent[];
  topAgents: Array<{ id: string; label: string; spentHbar: string }>;
}

export interface AgentStore {
  createAgent(input: CreateAgentInput): Promise<{ agent: AgentRecord; claimCode: string }>;
  claimAgent(input: ClaimAgentInput): Promise<ClaimAgentResult>;
  getAgent(id: string): Promise<AgentRecord | null>;
  getAgentByApiKey(apiKey: string): Promise<AgentRecord | null>;
  getAgentByClaim(claimCode: string): Promise<AgentRecord | null>;
  updateAgent(
    id: string,
    updates: Partial<Pick<AgentRecord, "state" | "walletAddress" | "accountId" | "did" | "spendLimitHbar">>,
  ): Promise<AgentRecord | null>;
  listAgents(): Promise<AgentRecord[]>;
  recordSpend(event: Omit<SpendEvent, "id" | "timestamp">): Promise<SpendEvent>;
  getDashboardStats(): Promise<DashboardStats>;
  clearAll?(): Promise<void>;
}
