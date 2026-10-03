export type SpendGuardDecision = "ALLOW" | "BLOCK" | "ESCALATE";

export interface SpendAuditRecord {
  id: string;
  timestamp: string; // ISO 8601
  action: string; // e.g. "transfer_hbar", "vault_pay"
  decision: SpendGuardDecision;
  recipient: string; // Account ID 0.0.X or EVM address
  amountHbar: number;
  amountTinybar: string;
  reason: string;
  scheduleId?: string;
  txId?: string;
  enforcement: "offchain" | "vault";
  agentAccountId: string;
}

export interface SpendHold {
  holdId: string;
  accountId: string;
  amountTinybar: bigint;
  createdAt: number;
  expiresAt: number;
}

export interface SpendStore {
  getDailySpent(accountId: string, windowMs?: number): Promise<bigint>;
  getActiveHoldsTotal(accountId: string): Promise<bigint>;
  reserveHold(
    accountId: string,
    amountTinybar: bigint,
    perDayCapTinybar: bigint,
    holdTtlMs?: number,
  ): Promise<{ allowed: boolean; holdId?: string; reason?: string }>;
  commitHold(holdId: string): Promise<void>;
  releaseHold(holdId: string): Promise<void>;
  recordDecision(record: SpendAuditRecord): Promise<void>;
  getAuditHistory(limit?: number): Promise<SpendAuditRecord[]>;
  clear(): Promise<void>;
}

export interface SpendGuardConfig {
  agentAccountId: string;
  mode: "auto" | "offchain" | "vault";
  vaultAddress?: string;
  perTaskCapHbar: number;
  perDayCapHbar: number;
  autoApprovalLimitHbar: number;
  allowlist: string[];
  blockedTools: string[];
  auditTopicId?: string;
  policyTopicId?: string;
  customFeeTinybar?: number;
  holdTtlMs?: number; // default 60000ms (1 min)
  rollingWindowMs?: number; // default 86400000ms (24h)
}

export interface PaymentParams {
  to: string;
  amountHbar: number;
  memo?: string;
  payerAccountId?: string;
}

export interface PaymentResult {
  success: boolean;
  decision: SpendGuardDecision;
  txId?: string;
  scheduleId?: string;
  reason?: string;
  enforcement: "offchain" | "vault";
  auditRecord?: SpendAuditRecord;
}

export const TINYBAR_PER_HBAR = 100_000_000n;

export function hbarToTinybar(hbar: number): bigint {
  return BigInt(Math.round(hbar * 100_000_000));
}

export function tinybarToHbar(tinybar: bigint): number {
  return Number(tinybar) / 100_000_000;
}
