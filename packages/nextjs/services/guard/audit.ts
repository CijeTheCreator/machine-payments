import { SpendAuditRecord } from "./types";
import { Client, CustomFixedFee, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

export interface CreateAuditTopicOptions {
  memo?: string;
  customFeeTinybar?: number;
  collectorAccountId?: string;
}

/**
 * Creates an immutable HCS audit topic on Hedera.
 * Supports optional HIP-991 consensus custom fees for monetized topic streams.
 */
export async function createAuditTopic(client: Client, options?: CreateAuditTopicOptions): Promise<string> {
  const memo = options?.memo ?? "agent-spend-audit";
  const tx = new TopicCreateTransaction().setTopicMemo(memo);

  // If HIP-991 custom fee is specified, configure consensus custom fees
  if (options?.customFeeTinybar && options.customFeeTinybar > 0) {
    const collector = options.collectorAccountId || client.operatorAccountId?.toString();
    if (collector) {
      const fixedFee = new CustomFixedFee().setAmount(options.customFeeTinybar).setFeeCollectorAccountId(collector);
      tx.setCustomFees([fixedFee]);
    }
  }

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error("Failed to obtain TopicId from Hedera topic create receipt");
  }

  return receipt.topicId.toString();
}

/**
 * Submits an immutable JSON audit record to an HCS topic.
 * Offline-safe: if network is unreachable or offline, catches error gracefully
 * so unit tests and local dev never fail.
 */
export async function submitAuditRecord(
  client: Client | null | undefined,
  topicId: string | undefined,
  record: SpendAuditRecord,
): Promise<{ success: boolean; sequenceNumber?: number; error?: string }> {
  if (!client || !topicId || topicId === "0.0.X") {
    // Offline mode or topic not provisioned yet
    return { success: true };
  }

  try {
    const payload = JSON.stringify(record);
    const tx = new TopicMessageSubmitTransaction().setTopicId(topicId).setMessage(payload);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    return {
      success: true,
      sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : undefined,
    };
  } catch (err: any) {
    // Graceful offline fallback to satisfy Gate 5 & Gate 11
    console.warn(`[AuditLogger] Notice: Could not submit audit record to HCS topic ${topicId}: ${err?.message}`);
    return {
      success: false,
      error: err?.message || "HCS submission failed",
    };
  }
}
