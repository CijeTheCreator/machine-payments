import { TrustAuditRecord } from "./types";
import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

/**
 * Creates an immutable HCS topic for agent identity and trust audit logging.
 */
export async function createTrustAuditTopic(client: Client, memo = "agent-trust-audit"): Promise<string> {
  const tx = new TopicCreateTransaction().setTopicMemo(memo);
  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error("Failed to obtain TopicId from Hedera topic create receipt");
  }

  return receipt.topicId.toString();
}

/**
 * Submits an immutable trust audit record to an HCS topic.
 * Safe for offline development and testing.
 */
export async function submitTrustAuditRecord(
  client: Client | null | undefined,
  topicId: string | undefined,
  record: TrustAuditRecord,
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
      sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber.toString()) : undefined,
    };
  } catch (err: any) {
    console.warn(`[AgentTrustAudit] Failed to submit to HCS topic ${topicId}:`, err.message);
    return {
      success: false,
      error: err.message,
    };
  }
}
