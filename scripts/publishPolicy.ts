import * as fs from "fs";
import * as path from "path";
import { TopicMessageSubmitTransaction } from "@hiero-ledger/sdk";
import { parse } from "envfile";
import { loadScriptConfig } from "./config";
import { getClientFromEnv } from "./createTopic";

const ROOT_ENV_PATH = path.resolve(__dirname, "../.env.local");

export function encodeMetadata(payload: Record<string, any>): string {
  const json = JSON.stringify(payload);
  const base64 = Buffer.from(json, "utf-8").toString("base64");
  return `data:application/json;base64,${base64}`;
}

async function main() {
  console.log("=================================================");
  console.log("   🗂️  Scaffold-HBAR: Publish HCS-2 Policy Version");
  console.log("=================================================\n");

  const config = loadScriptConfig();

  // Read env config for topic IDs
  let envConfig: Record<string, string> = {};
  if (fs.existsSync(ROOT_ENV_PATH)) {
    try {
      envConfig = parse(fs.readFileSync(ROOT_ENV_PATH, "utf-8")) as Record<string, string>;
    } catch {
      // ignore
    }
  }

  const policyTopicId =
    process.env.HCS_POLICY_TOPIC_ID ||
    process.env.NEXT_PUBLIC_HCS_POLICY_TOPIC_ID ||
    envConfig["HCS_POLICY_TOPIC_ID"] ||
    envConfig["NEXT_PUBLIC_HCS_POLICY_TOPIC_ID"] ||
    config.hcs.policyTopicId;

  const auditTopicId =
    process.env.HCS_AUDIT_TOPIC_ID ||
    process.env.NEXT_PUBLIC_HCS_AUDIT_TOPIC_ID ||
    envConfig["HCS_AUDIT_TOPIC_ID"] ||
    envConfig["NEXT_PUBLIC_HCS_AUDIT_TOPIC_ID"] ||
    config.hcs.auditTopicId;

  if (!policyTopicId || policyTopicId === "0.0.X") {
    throw new Error(
      "HCS_POLICY_TOPIC_ID not found. Please run 'yarn script:create-topic' first to create the registry topic.",
    );
  }

  const { client, operatorId } = getClientFromEnv();
  console.log(`Operator Account: ${operatorId}`);
  console.log(`Target HCS-2 Policy Topic: ${policyTopicId}`);
  if (auditTopicId) {
    console.log(`Linked Audit Topic:       ${auditTopicId}`);
  }

  const reason = process.argv[2] || "Policy version published via Scaffold-HBAR CLI";

  // Build policy snapshot
  const policySnapshot = {
    currency: config.agent.currency || "HBAR",
    perTaskHbar: config.spendGuard.caps.perTaskHbar,
    perDayHbar: config.spendGuard.caps.perDayHbar,
    autoApprovalLimitHbar: config.spendGuard.caps.autoApprovalLimitHbar,
    allowlist: config.spendGuard.allowlist,
    blockedTools: config.spendGuard.blockedTools,
    mode: config.agent.mode,
    reason,
    ts: Date.now(),
  };

  console.log("\nPolicy Configuration to Publish:");
  console.log("--------------------------------");
  console.log(`Currency:            ${policySnapshot.currency}`);
  console.log(`Per-Task Cap:        ${policySnapshot.perTaskHbar} ℏ`);
  console.log(`24h Rolling Cap:     ${policySnapshot.perDayHbar} ℏ`);
  console.log(`Auto-Approval Limit: ${policySnapshot.autoApprovalLimitHbar} ℏ`);
  console.log(`Allowlist (${policySnapshot.allowlist.length} accounts):  ${policySnapshot.allowlist.join(", ") || "(none)"}`);
  console.log(`Blocked Tools:       ${policySnapshot.blockedTools.join(", ")}`);
  console.log(`Publish Reason:      "${reason}"`);
  console.log("--------------------------------\n");

  const metadata = encodeMetadata(policySnapshot);

  const hcs2Payload = {
    p: "hcs-2",
    op: "register",
    t_id: auditTopicId,
    metadata,
    m: reason,
  };

  console.log("Submitting HCS-2 registration message to Hedera consensus...");
  const rawMessage = JSON.stringify(hcs2Payload);
  const tx = new TopicMessageSubmitTransaction().setTopicId(policyTopicId).setMessage(rawMessage);

  const response = await tx.execute(client);
  const receipt = await response.getReceipt(client);

  const seqNo = receipt.topicSequenceNumber ? Number(receipt.topicSequenceNumber) : "N/A";
  console.log("\n✅ Policy Version Registered in Consensus!");
  console.log(`   - Sequence Number: #${seqNo}`);
  console.log(`   - Topic ID:        ${policyTopicId}`);
  console.log(`   - Transaction ID:  ${response.transactionId.toString()}`);
  console.log(`   - Topic Explorer:  https://hashscan.io/testnet/topic/${policyTopicId}`);
  console.log(`   - Verify in dApp:  http://localhost:3000/verify`);
}

if (require.main === module) {
  main().catch(err => {
    console.error("❌ Failed to publish policy:", err.message || err);
    process.exit(1);
  });
}
