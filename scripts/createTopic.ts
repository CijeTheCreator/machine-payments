import * as fs from "fs";
import * as path from "path";
import { Client, AccountId, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";
import { parse, stringify } from "envfile";
import { loadScriptConfig } from "./config";

const ROOT_ENV_PATH = path.resolve(__dirname, "../.env.local");
const NEXTJS_ENV_PATH = path.resolve(__dirname, "../packages/nextjs/.env.local");

export function updateTopicEnv(auditTopicId: string, policyTopicId: string): void {
  const envTargets = [ROOT_ENV_PATH, NEXTJS_ENV_PATH];

  for (const envPath of envTargets) {
    let currentConfig: Record<string, string> = {};
    if (fs.existsSync(envPath)) {
      try {
        currentConfig = parse(fs.readFileSync(envPath, "utf-8")) as Record<string, string>;
      } catch {
        currentConfig = {};
      }
    }

    currentConfig["HCS_AUDIT_TOPIC_ID"] = auditTopicId;
    currentConfig["NEXT_PUBLIC_HCS_AUDIT_TOPIC_ID"] = auditTopicId;
    currentConfig["HCS_POLICY_TOPIC_ID"] = policyTopicId;
    currentConfig["NEXT_PUBLIC_HCS_POLICY_TOPIC_ID"] = policyTopicId;

    fs.writeFileSync(envPath, stringify(currentConfig));
  }
}

export function getClientFromEnv(): { client: Client; operatorId: string } {
  // Load environment variables if available
  let envConfig: Record<string, string> = {};
  if (fs.existsSync(ROOT_ENV_PATH)) {
    try {
      envConfig = parse(fs.readFileSync(ROOT_ENV_PATH, "utf-8")) as Record<string, string>;
    } catch {
      // ignore
    }
  }

  const operatorIdStr =
    process.env.HEDERA_OPERATOR_ACCOUNT_ID ||
    process.env.AGENT_ACCOUNT_ID ||
    envConfig["HEDERA_OPERATOR_ACCOUNT_ID"] ||
    envConfig["AGENT_ACCOUNT_ID"];

  const operatorKeyStr =
    process.env.HEDERA_OPERATOR_PRIVATE_KEY ||
    process.env.AGENT_PRIVATE_KEY ||
    envConfig["HEDERA_OPERATOR_PRIVATE_KEY"] ||
    envConfig["AGENT_PRIVATE_KEY"];

  if (!operatorIdStr || !operatorKeyStr || operatorIdStr === "0.0.X") {
    throw new Error(
      "Operator credentials not configured. Please set AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY in .env.local or run 'yarn script:fund-agent'.",
    );
  }

  const client = Client.forTestnet();
  const operatorId = AccountId.fromString(operatorIdStr);
  const operatorKey = PrivateKey.fromStringDer(operatorKeyStr);

  client.setOperator(operatorId, operatorKey);

  return { client, operatorId: operatorIdStr };
}

async function main() {
  console.log("=================================================");
  console.log("   📜 Scaffold-HBAR: Create HCS & HCS-2 Topics   ");
  console.log("=================================================\n");

  const config = loadScriptConfig();
  const auditMemo = config.hcs.auditTopicMemo || "agent-spend-audit";
  const policyMemo = config.hcs.policyTopicMemo || "hcs-2:0:86400";

  console.log(`Auditing Memo:        ${auditMemo}`);
  console.log(`Policy Registry Memo: ${policyMemo}\n`);

  const { client, operatorId } = getClientFromEnv();
  console.log(`Using Operator Account: ${operatorId}`);

  // 1. Create HCS Audit Topic
  console.log("\n1️⃣  Creating HCS Audit Topic...");
  const auditTx = new TopicCreateTransaction().setTopicMemo(auditMemo);
  const auditResp = await auditTx.execute(client);
  const auditReceipt = await auditResp.getReceipt(client);
  const auditTopicId = auditReceipt.topicId?.toString();

  if (!auditTopicId) {
    throw new Error("Failed to create audit topic");
  }
  console.log(`   ✅ Audit Topic Created: ${auditTopicId}`);
  console.log(`      Explorer: https://hashscan.io/testnet/topic/${auditTopicId}`);

  // 2. Create HCS-2 Policy Registry Topic with Owner-Only Submit Key
  console.log("\n2️⃣  Creating HCS-2 Policy Registry Topic (Owner-only submit key)...");
  const policyTx = new TopicCreateTransaction().setTopicMemo(policyMemo);
  if (client.operatorPublicKey) {
    policyTx.setSubmitKey(client.operatorPublicKey);
  }
  const policyResp = await policyTx.execute(client);
  const policyReceipt = await policyResp.getReceipt(client);
  const policyTopicId = policyReceipt.topicId?.toString();

  if (!policyTopicId) {
    throw new Error("Failed to create policy registry topic");
  }
  console.log(`   ✅ Policy Registry Topic Created: ${policyTopicId}`);
  console.log(`      Explorer: https://hashscan.io/testnet/topic/${policyTopicId}`);

  // 3. Update environment files
  updateTopicEnv(auditTopicId, policyTopicId);
  console.log("\n✅ Topic IDs written to:");
  console.log(`   - ${ROOT_ENV_PATH}`);
  console.log(`   - ${NEXTJS_ENV_PATH}`);

  console.log("\n💡 Next step: Run 'yarn script:publish-policy' to register your active policy on-chain.");
}

if (require.main === module) {
  main().catch(err => {
    console.error("❌ Failed to create topics:", err.message || err);
    process.exit(1);
  });
}
