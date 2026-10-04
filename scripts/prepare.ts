import * as fs from "fs";
import * as path from "path";
import { execSync } from "child_process";
import { Client, AccountId, PrivateKey, TopicCreateTransaction } from "@hiero-ledger/sdk";
import { parse, stringify } from "envfile";
import { generateLocalKeys, writeLocalEnv } from "./postinstallKeygen";

export const ROOT_ENV_PATH = path.resolve(__dirname, "../.env.local");
export const ROOT_DOTENV_PATH = path.resolve(__dirname, "../.env");
export const NEXTJS_ENV_PATH = path.resolve(__dirname, "../packages/nextjs/.env.local");

export interface AccountCheckResult {
  exists: boolean;
  balanceHbar: number;
  accountId?: string;
  evmAddress?: string;
}

export function loadEnvConfig(): Record<string, string> {
  let config: Record<string, string> = {};
  for (const envPath of [ROOT_DOTENV_PATH, ROOT_ENV_PATH]) {
    if (fs.existsSync(envPath)) {
      try {
        const parsed = parse(fs.readFileSync(envPath, "utf-8")) as Record<string, string>;
        config = { ...config, ...parsed };
      } catch {
        // ignore
      }
    }
  }
  return config;
}

export function updateEnvVariables(updates: Record<string, string>): void {
  const envTargets = [ROOT_ENV_PATH, ROOT_DOTENV_PATH, NEXTJS_ENV_PATH];

  for (const envPath of envTargets) {
    let currentConfig: Record<string, string> = {};
    if (fs.existsSync(envPath)) {
      try {
        currentConfig = parse(fs.readFileSync(envPath, "utf-8")) as Record<string, string>;
      } catch {
        currentConfig = {};
      }
    }

    for (const [key, value] of Object.entries(updates)) {
      currentConfig[key] = value;
    }

    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, stringify(currentConfig));
  }
}

/**
 * Checks an account or EVM address balance on the Hedera Mirror Node.
 */
export async function checkAccountBalance(
  target: string,
  network: string = "testnet",
  mirrorBaseUrl?: string,
): Promise<AccountCheckResult> {
  const host =
    mirrorBaseUrl ||
    (network === "mainnet"
      ? "https://mainnet-public.mirrornode.hedera.com"
      : "https://testnet.mirrornode.hedera.com");

  const cleanTarget = target.trim();
  const url = `${host}/api/v1/accounts/${cleanTarget}`;

  try {
    const res = await fetch(url);
    if (!res.ok) {
      return { exists: false, balanceHbar: 0 };
    }
    const data: any = await res.json();
    const tinybar = data?.balance?.balance || 0;
    const balanceHbar = Number(tinybar) / 100_000_000;
    return {
      exists: true,
      balanceHbar,
      accountId: data?.account,
      evmAddress: data?.evm_address,
    };
  } catch {
    return { exists: false, balanceHbar: 0 };
  }
}

/**
 * Creates the required HCS topics for spend audit, policy registry, and agent trust.
 */
export async function createTopics(
  client: Client,
  operatorKey: PrivateKey,
  memos = {
    spendAudit: "agent-spend-audit",
    policyRegistry: "hcs-2:0:86400",
    trustAudit: "agent-trust-audit",
  },
): Promise<{ auditTopicId: string; policyTopicId: string; trustTopicId: string }> {
  // 1. Spend Audit Topic
  const auditTx = new TopicCreateTransaction().setTopicMemo(memos.spendAudit);
  const auditResp = await auditTx.execute(client);
  const auditReceipt = await auditResp.getReceipt(client);
  const auditTopicId = auditReceipt.topicId?.toString();
  if (!auditTopicId) throw new Error("Failed to create HCS spend audit topic");

  // 2. Policy Registry Topic (Owner-only submit key)
  const policyTx = new TopicCreateTransaction()
    .setTopicMemo(memos.policyRegistry)
    .setAdminKey(operatorKey)
    .setSubmitKey(operatorKey);
  const policyResp = await policyTx.execute(client);
  const policyReceipt = await policyResp.getReceipt(client);
  const policyTopicId = policyReceipt.topicId?.toString();
  if (!policyTopicId) throw new Error("Failed to create HCS policy registry topic");

  // 3. Trust Audit Topic
  const trustTx = new TopicCreateTransaction().setTopicMemo(memos.trustAudit);
  const trustResp = await trustTx.execute(client);
  const trustReceipt = await trustResp.getReceipt(client);
  const trustTopicId = trustReceipt.topicId?.toString();
  if (!trustTopicId) throw new Error("Failed to create HCS agent trust topic");

  return { auditTopicId, policyTopicId, trustTopicId };
}

/**
 * Reads deployed contract address from hardhat deployments.
 */
export function getDeployedContractAddress(contractName: string, network = "hederaTestnet"): string | null {
  const deploymentPath = path.resolve(
    __dirname,
    `../packages/hardhat/deployments/${network}/${contractName}.json`,
  );
  if (fs.existsSync(deploymentPath)) {
    try {
      const data = JSON.parse(fs.readFileSync(deploymentPath, "utf-8"));
      return data.address || null;
    } catch {
      return null;
    }
  }
  return null;
}

export function printFundingPrompt(target: string, evmAddress?: string, privateKey?: string): void {
  console.log("\n" + "=".repeat(78));
  console.log("  ⚠️  Hedera Account Not Yet Funded on Testnet");
  console.log("=".repeat(78));
  console.log(`  Target Account / Alias: ${target}`);
  if (evmAddress && evmAddress !== target) {
    console.log(`  EVM Address Alias:      ${evmAddress}`);
  }
  if (privateKey) {
    console.log(`  Private Key (DER):      ${privateKey}`);
  }
  console.log("  Current Balance:        0 HBAR\n");
  console.log("  Before deploying your Vault and HCS topics, please fund this account:");
  console.log("  Option 1: Request testnet HBAR from the official Hedera Portal Faucet:");
  console.log("            🔗 https://portal.hedera.com/faucet");
  console.log(`            Enter your address: ${evmAddress || target}`);
  console.log("  Option 2: Replace AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY in .env / .env.local");
  console.log("            with your funded account credentials from https://portal.hedera.com");
  console.log("\n  Once funded, re-run:");
  console.log("    yarn script:prepare");
  console.log("=".repeat(78) + "\n");
}

export function parseHederaPrivateKey(keyStr: string): PrivateKey {
  const clean = keyStr.trim();
  if (clean.startsWith("30")) {
    return PrivateKey.fromStringDer(clean);
  }
  const hex = clean.replace(/^0x/, "");
  try {
    return PrivateKey.fromStringECDSA(hex);
  } catch {
    return PrivateKey.fromStringED25519(hex);
  }
}

export async function main() {
  console.log("=================================================");
  console.log("   🚀 Scaffold-HBAR: Merchant & Vault Preparation ");
  console.log("=================================================\n");

  let envConfig = loadEnvConfig();
  let privateKeyStr = process.env.AGENT_PRIVATE_KEY || envConfig["AGENT_PRIVATE_KEY"];
  let accountIdStr = process.env.AGENT_ACCOUNT_ID || envConfig["AGENT_ACCOUNT_ID"] || "0.0.X";
  let evmAddressStr = process.env.AGENT_EVM_ADDRESS || envConfig["AGENT_EVM_ADDRESS"];
  const network = process.env.HEDERA_NETWORK || envConfig["HEDERA_NETWORK"] || "testnet";

  // Step 1: Ensure credentials exist
  if (!privateKeyStr) {
    console.log("No agent credentials found in .env / .env.local. Generating local keypair...");
    const keys = generateLocalKeys();
    writeLocalEnv(keys, "0.0.X");
    privateKeyStr = keys.privateKey;
    evmAddressStr = keys.evmAddress;
    envConfig = loadEnvConfig();
    console.log(`  🔑 Auto-generated EVM Address: ${keys.evmAddress}`);
    console.log(`  🔑 Auto-generated Private Key: ${keys.privateKey}\n`);
  }

  // Step 2: Check balance on Hedera Testnet Mirror Node
  const lookupTarget =
    accountIdStr && accountIdStr !== "0.0.X" ? accountIdStr : evmAddressStr;

  if (!lookupTarget) {
    console.error("❌ Unable to determine account ID or EVM address for balance check.");
    process.exit(1);
  }

  console.log(`Checking balance for ${lookupTarget} on Hedera ${network}...`);
  const checkResult = await checkAccountBalance(lookupTarget, network);

  if (!checkResult.exists || checkResult.balanceHbar <= 0) {
    printFundingPrompt(lookupTarget, evmAddressStr, privateKeyStr);
    return;
  }

  console.log(`✅ Account confirmed! Balance: ${checkResult.balanceHbar.toFixed(4)} HBAR`);

  // Update canonical Account ID in .env.local if resolved from EVM alias
  if (checkResult.accountId && checkResult.accountId !== accountIdStr) {
    console.log(`Discovered Hedera Account ID: ${checkResult.accountId}`);
    accountIdStr = checkResult.accountId;
    updateEnvVariables({ AGENT_ACCOUNT_ID: accountIdStr });
  }

  // Step 3: Deploy Smart Contracts via Hardhat
  console.log("\n📦 Deploying Vault & AgentRegistry contracts via Hardhat...");
  const hardhatNetwork = network === "mainnet" ? "hederaMainnet" : "hederaTestnet";

  try {
    execSync(`yarn workspace @sh/hardhat hardhat deploy --network ${hardhatNetwork}`, {
      stdio: "inherit",
      env: {
        ...process.env,
        AGENT_PRIVATE_KEY: privateKeyStr,
        AGENT_ACCOUNT_ID: accountIdStr,
        AGENT_EVM_ADDRESS: evmAddressStr,
      },
    });
  } catch (err: any) {
    console.error("❌ Contract deployment failed:", err.message);
    process.exit(1);
  }

  const vaultAddress = getDeployedContractAddress("Vault", hardhatNetwork);
  const registryAddress = getDeployedContractAddress("AgentRegistry", hardhatNetwork);

  console.log("\n✅ Smart Contracts deployed:");
  console.log(`   - Vault Contract:         ${vaultAddress || "Deployed"}`);
  console.log(`   - AgentRegistry Contract: ${registryAddress || "Deployed"}`);

  // Step 4: Create HCS Topics
  console.log("\n📜 Initializing HCS Topics...");
  const operatorKey = parseHederaPrivateKey(privateKeyStr);

  const client = network === "mainnet" ? Client.forMainnet() : Client.forTestnet();
  client.setOperator(AccountId.fromString(accountIdStr), operatorKey);

  const topics = await createTopics(client, operatorKey);

  console.log("✅ HCS Topics created:");
  console.log(`   - Spend Audit Topic:        ${topics.auditTopicId}`);
  console.log(`   - HCS-2 Policy Topic:       ${topics.policyTopicId}`);
  console.log(`   - Agent Trust Audit Topic:  ${topics.trustTopicId}`);

  // Step 5: Update environment configurations
  const envUpdates: Record<string, string> = {
    HCS_AUDIT_TOPIC_ID: topics.auditTopicId,
    NEXT_PUBLIC_HCS_AUDIT_TOPIC_ID: topics.auditTopicId,
    HCS_POLICY_TOPIC_ID: topics.policyTopicId,
    NEXT_PUBLIC_HCS_POLICY_TOPIC_ID: topics.policyTopicId,
    AGENT_TRUST_AUDIT_TOPIC_ID: topics.trustTopicId,
    NEXT_PUBLIC_AGENT_TRUST_AUDIT_TOPIC_ID: topics.trustTopicId,
  };

  if (vaultAddress) {
    envUpdates["VAULT_CONTRACT_ID"] = vaultAddress;
    envUpdates["NEXT_PUBLIC_VAULT_ADDRESS"] = vaultAddress;
  }
  if (registryAddress) {
    envUpdates["AGENT_REGISTRY_ADDRESS"] = registryAddress;
  }

  updateEnvVariables(envUpdates);

  console.log("\n" + "=".repeat(78));
  console.log("  🎉 Preparation Complete! All Systems Configured in .env.local");
  console.log("=".repeat(78));
  console.log(`  Vault Address:      ${vaultAddress || "Configured"}`);
  console.log(`  Audit Topic:        ${topics.auditTopicId}`);
  console.log(`  Policy Topic:       ${topics.policyTopicId}`);
  console.log(`  Trust Audit Topic:  ${topics.trustTopicId}`);
  console.log("\n  You are now ready to generate x402 monetized API endpoints:");
  console.log("    yarn script:make-route --name my-service --price 1");
  console.log("=".repeat(78) + "\n");

  client.close();
  process.exit(0);
}

if (require.main === module) {
  main().catch(err => {
    console.error("Preparation script error:", err);
    process.exit(1);
  });
}
