import { SpendAuditRecord, SpendHold, SpendStore } from "./types";

interface SpendEntry {
  accountId: string;
  amountTinybar: bigint;
  timestamp: number;
}

/**
 * In-Memory Spend Store with atomic hold reservations and rolling-24h window tracking.
 * Zero external dependencies. Safe for offline tests, local development, and serverless executions.
 */
export class InMemorySpendStore implements SpendStore {
  private spends: SpendEntry[] = [];
  private holds: Map<string, SpendHold> = new Map();
  private auditHistory: SpendAuditRecord[] = [];
  private readonly defaultWindowMs: number;
  private readonly defaultHoldTtlMs: number;

  constructor(options?: { rollingWindowMs?: number; holdTtlMs?: number }) {
    this.defaultWindowMs = options?.rollingWindowMs ?? 24 * 60 * 60 * 1000; // 24 hours
    this.defaultHoldTtlMs = options?.holdTtlMs ?? 60 * 1000; // 60 seconds
  }

  private cleanExpired(now = Date.now(), windowMs = this.defaultWindowMs): void {
    // Purge spends older than the rolling window
    const cutoff = now - windowMs;
    this.spends = this.spends.filter(s => s.timestamp >= cutoff);

    // Purge expired holds
    for (const [id, hold] of this.holds.entries()) {
      if (hold.expiresAt <= now) {
        this.holds.delete(id);
      }
    }
  }

  async getDailySpent(accountId: string, windowMs = this.defaultWindowMs): Promise<bigint> {
    const now = Date.now();
    this.cleanExpired(now, windowMs);
    const cutoff = now - windowMs;

    return this.spends
      .filter(s => s.accountId === accountId && s.timestamp >= cutoff)
      .reduce((sum, s) => sum + s.amountTinybar, 0n);
  }

  async getActiveHoldsTotal(accountId: string): Promise<bigint> {
    const now = Date.now();
    this.cleanExpired(now);

    let total = 0n;
    for (const hold of this.holds.values()) {
      if (hold.accountId === accountId && hold.expiresAt > now) {
        total += hold.amountTinybar;
      }
    }
    return total;
  }

  /**
   * Atomically reserves a hold against the rolling 24h budget.
   * If (dailySpent + activeHolds + amount) > perDayCap, the reservation is rejected.
   */
  async reserveHold(
    accountId: string,
    amountTinybar: bigint,
    perDayCapTinybar: bigint,
    holdTtlMs = this.defaultHoldTtlMs,
  ): Promise<{ allowed: boolean; holdId?: string; reason?: string }> {
    const now = Date.now();
    this.cleanExpired(now);

    const currentSpent = await this.getDailySpent(accountId);
    const currentHolds = await this.getActiveHoldsTotal(accountId);
    const wouldSpend = currentSpent + currentHolds + amountTinybar;

    if (wouldSpend > perDayCapTinybar) {
      return {
        allowed: false,
        reason: `Exceeds rolling 24h cap: current spent ${Number(currentSpent) / 1e8} HBAR + holds ${Number(currentHolds) / 1e8} HBAR + proposed ${Number(amountTinybar) / 1e8} HBAR > cap ${Number(perDayCapTinybar) / 1e8} HBAR`,
      };
    }

    const holdId = `hold_${now}_${Math.random().toString(36).slice(2, 9)}`;
    const hold: SpendHold = {
      holdId,
      accountId,
      amountTinybar,
      createdAt: now,
      expiresAt: now + holdTtlMs,
    };
    this.holds.set(holdId, hold);

    return {
      allowed: true,
      holdId,
    };
  }

  async commitHold(holdId: string): Promise<void> {
    const hold = this.holds.get(holdId);
    if (!hold) return;

    this.spends.push({
      accountId: hold.accountId,
      amountTinybar: hold.amountTinybar,
      timestamp: Date.now(),
    });
    this.holds.delete(holdId);
  }

  async releaseHold(holdId: string): Promise<void> {
    this.holds.delete(holdId);
  }

  async recordDecision(record: SpendAuditRecord): Promise<void> {
    this.auditHistory.unshift(record);
    // Keep max 1000 in memory
    if (this.auditHistory.length > 1000) {
      this.auditHistory.pop();
    }
  }

  async getAuditHistory(limit = 50): Promise<SpendAuditRecord[]> {
    return this.auditHistory.slice(0, limit);
  }

  async clear(): Promise<void> {
    this.spends = [];
    this.holds.clear();
    this.auditHistory = [];
  }
}

const defaultStoreInstance = new InMemorySpendStore();

export function getDefaultSpendStore(): InMemorySpendStore {
  return defaultStoreInstance;
}
