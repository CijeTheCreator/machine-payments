import { Client, TopicCreateTransaction, TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";

export const HCS2_PROTOCOL = "hcs-2";

export interface PolicySnapshot {
  currency: string;
  perTaskHbar: number;
  perDayHbar: number;
  autoApprovalLimitHbar: number;
  allowlist: string[];
  blockedTools: string[];
  mode?: string;
  metadata?: Record<string, any>;
}

export interface PolicyVersion extends PolicySnapshot {
  /** 1-based sequential version number in consensus order */
  version: number;
  reason: string;
  /** Wall-clock timestamp (ms) at publish time */
  ts: number;
  sequenceNumber: number;
  consensusTimestamp: string;
  payerAccountId?: string;
}

export interface Hcs2RegisterMessage {
  p: "hcs-2";
  op: "register";
  t_id?: string;
  metadata: string;
  m?: string;
}

/**
 * Encodes a JSON payload into an RFC 2397 data URI string with base64 encoding.
 * Example: `data:application/json;base64,ey...`
 */
export function encodeHcs2Metadata(payload: Record<string, any>): string {
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, "utf-8").toString("base64");
  return `data:application/json;base64,${base64}`;
}

/**
 * Decodes an HCS-2 metadata string (with or without data URI prefix) into a typed object.
 */
export function decodeHcs2Metadata<T = any>(metadataStr: string): T {
  if (!metadataStr || typeof metadataStr !== "string") {
    throw new Error("Invalid HCS-2 metadata string");
  }
  let base64 = metadataStr.trim();
  if (base64.startsWith("data:")) {
    const commaIdx = base64.indexOf(",");
    if (commaIdx !== -1) {
      base64 = base64.substring(commaIdx + 1);
    }
  }
  const jsonStr = Buffer.from(base64, "base64").toString("utf-8");
  return JSON.parse(jsonStr) as T;
}

/**
 * Formats a valid HCS-2 action message payload for publishing.
 */
export function formatHcs2Message(options: {
  policy: PolicySnapshot;
  reason?: string;
  auditTopicId?: string;
  timestamp?: number;
}): Hcs2RegisterMessage {
  const reason = options.reason || "Policy update";
  const ts = options.timestamp ?? Date.now();
  const innerPayload = {
    currency: options.policy.currency,
    perTaskHbar: options.policy.perTaskHbar,
    perDayHbar: options.policy.perDayHbar,
    autoApprovalLimitHbar: options.policy.autoApprovalLimitHbar,
    allowlist: options.policy.allowlist,
    blockedTools: options.policy.blockedTools,
    mode: options.policy.mode || "auto",
    metadata: options.policy.metadata,
    reason,
    ts,
  };

  return {
    p: HCS2_PROTOCOL,
    op: "register",
    t_id: options.auditTopicId,
    metadata: encodeHcs2Metadata(innerPayload),
    m: reason,
  };
}

/**
 * Creates an HCS-2 indexed registry topic (`hcs-2:0:<ttl>`) with owner-only submit key.
 * Only the owner/operator key can publish policy versions, preventing unauthorized cap tampering.
 */
export async function createPolicyRegistryTopic(
  client: Client,
  options?: {
    ttl?: number;
    memo?: string;
  },
): Promise<string> {
  const ttl = options?.ttl ?? 86400;
  const memo = options?.memo ?? `${HCS2_PROTOCOL}:0:${ttl}`;

  const tx = new TopicCreateTransaction().setTopicMemo(memo);
  const submitKey = client.operatorPublicKey;
  if (submitKey) {
    tx.setSubmitKey(submitKey);
  }

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.topicId) {
    throw new Error("Failed to obtain TopicId from Hedera topic create receipt");
  }

  return receipt.topicId.toString();
}

/**
 * Publishes an immutable policy version to the HCS-2 registry topic.
 * Safe for offline development: returns success false gracefully without throwing if network is offline.
 */
export async function publishPolicyVersion(
  client: Client | null | undefined,
  policy: PolicySnapshot,
  registryTopicId: string | undefined,
  options?: {
    reason?: string;
    auditTopicId?: string;
  },
): Promise<{
  success: boolean;
  sequenceNumber?: number;
  consensusTimestamp?: string;
  message?: Hcs2RegisterMessage;
  error?: string;
}> {
  const message = formatHcs2Message({
    policy,
    reason: options?.reason,
    auditTopicId: options?.auditTopicId,
  });

  if (!client || !registryTopicId || registryTopicId === "0.0.X") {
    // Offline or unconfigured mode
    return {
      success: true,
      message,
    };
  }

  try {
    const rawMessage = JSON.stringify(message);
    const tx = new TopicMessageSubmitTransaction().setTopicId(registryTopicId).setMessage(rawMessage);

    const response = await tx.execute(client);
    const receipt = await response.getReceipt(client);

    return {
      success: true,
      sequenceNumber: receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : undefined,
      message,
    };
  } catch (err: any) {
    console.warn(
      `[PolicyRegistry] Warning: Could not publish policy version to HCS topic ${registryTopicId}: ${err?.message}`,
    );
    return {
      success: false,
      message,
      error: err?.message || "Policy publication failed",
    };
  }
}

/**
 * Reads the full policy version history from the HCS-2 registry via Hedera Mirror Node.
 * Returns versions in ascending consensus order.
 */
export async function readPolicyVersions(
  registryTopicId: string,
  mirrorBaseUrl: string,
  trustedPayer?: string,
): Promise<PolicyVersion[]> {
  if (!registryTopicId || registryTopicId === "0.0.X") {
    return [];
  }

  const versions: PolicyVersion[] = [];
  const cleanMirrorBase = mirrorBaseUrl.replace(/\/api\/v1\/?$/, "");
  let url: string | null = `${cleanMirrorBase}/api/v1/topics/${registryTopicId}/messages?order=asc&limit=100`;
  let versionCounter = 0;

  try {
    while (url) {
      const res = await fetch(url, { cache: "no-store" });
      if (!res.ok) break;

      const json: any = await res.json();
      const messages = json.messages || [];

      for (const m of messages) {
        if (trustedPayer && m.payer_account_id !== trustedPayer) {
          // Skip non-owner published versions if a trusted payer account is enforced
          continue;
        }

        try {
          const rawUtf8 = Buffer.from(m.message, "base64").toString("utf-8");
          const parsed = JSON.parse(rawUtf8);

          if (parsed.p !== HCS2_PROTOCOL || parsed.op !== "register" || typeof parsed.metadata !== "string") {
            continue;
          }

          const decoded = decodeHcs2Metadata<any>(parsed.metadata);
          versionCounter++;

          versions.push({
            version: versionCounter,
            currency: decoded.currency || "HBAR",
            perTaskHbar: Number(decoded.perTaskHbar ?? decoded.perTask ?? 0),
            perDayHbar: Number(decoded.perDayHbar ?? decoded.perDay ?? 0),
            autoApprovalLimitHbar: Number(decoded.autoApprovalLimitHbar ?? decoded.autoUnder ?? 0),
            allowlist: Array.isArray(decoded.allowlist) ? decoded.allowlist : [],
            blockedTools: Array.isArray(decoded.blockedTools) ? decoded.blockedTools : [],
            mode: decoded.mode || "auto",
            metadata: decoded.metadata,
            reason: decoded.reason || parsed.m || "",
            ts: decoded.ts || 0,
            sequenceNumber: m.sequence_number,
            consensusTimestamp: m.consensus_timestamp,
            payerAccountId: m.payer_account_id,
          });
        } catch {
          // Ignore malformed messages on topic
        }
      }

      const next = json.links?.next;
      url = next ? new URL(next, cleanMirrorBase).toString() : null;
    }
  } catch (err: any) {
    console.warn(`[PolicyRegistry] Mirror node read error: ${err?.message}`);
  }

  return versions;
}

/**
 * Returns the latest active policy from the registry, or null if no version found.
 */
export async function getActivePolicy(
  registryTopicId: string,
  mirrorBaseUrl: string,
  trustedPayer?: string,
): Promise<PolicyVersion | null> {
  const all = await readPolicyVersions(registryTopicId, mirrorBaseUrl, trustedPayer);
  return all.length ? all[all.length - 1] : null;
}
