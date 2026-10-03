import * as readline from "readline";
import { generateAgentKeys, writeAgentEnv, AgentKeys } from "./createAgent";

const DEFAULT_FAUCET_URL = process.env.FAUCET_URL || "http://localhost:3001";
const REQUEST_TIMEOUT_MS = 6000;

interface DispenseResponse {
  success: boolean;
  action?: string;
  accountId?: string;
  transactionId?: string;
  amountHbar?: number;
  error?: string;
  message?: string;
}

export async function requestFaucetDispense(
  faucetUrl: string,
  publicKey: string,
): Promise<DispenseResponse> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${faucetUrl}/api/dispense`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        publicKey,
        keyType: "ECDSA",
      }),
      signal: controller.signal,
    });

    const data = (await response.json()) as any;

    if (!response.ok) {
      return {
        success: false,
        error: data.error || `HTTP_${response.status}`,
        message: data.message || `Faucet returned status ${response.status}`,
      };
    }

    return {
      success: true,
      action: data.action,
      accountId: data.accountId,
      transactionId: data.transactionId,
      amountHbar: data.amountHbar,
    };
  } finally {
    clearTimeout(timeoutId);
  }
}

async function promptUser(questionText: string): Promise<string> {
  if (!process.stdin.isTTY || process.env.CI) {
    return "";
  }

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });

  return new Promise(resolve => {
    const timeout = setTimeout(() => {
      rl.close();
      resolve("");
    }, 10000);

    rl.question(questionText, answer => {
      clearTimeout(timeout);
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function handleFallback(keys: AgentKeys, reason: string): Promise<void> {
  console.log("\n========================================================");
  console.log(`⚠️  FAUCET UNAVAILABLE: ${reason}`);
  console.log("========================================================\n");
  console.log("Don't worry! Your ECDSA agent keypair has been generated locally:");
  console.log("--------------------------------------------------------");
  console.log(`🔑 Public Key (DER): ${keys.publicKeyDer}`);
  console.log(`🌐 EVM Address:       ${keys.evmAddress}`);
  console.log(`🔒 Private Key:       ${keys.privateKey}`);
  console.log("--------------------------------------------------------\n");
  console.log("📋 Fallback Manual Onboarding Instructions:");
  console.log("1. Open the official Hedera Developer Portal Faucet:");
  console.log("   👉 https://portal.hedera.com/");
  console.log("2. Create a free testnet account by pasting the Public Key above, or transfer testnet HBAR to the EVM address.");
  console.log("3. Once created, you will receive an Account ID (e.g., 0.0.1234567).\n");

  const inputAccountId = await promptUser("👉 If you have an Account ID, enter it here (or press Enter to write placeholder): ");

  const accountIdToSave = inputAccountId && /^0\.0\.\d+$/.test(inputAccountId) ? inputAccountId : "0.0.X";

  writeAgentEnv(keys, accountIdToSave);

  console.log(`\n💾 Saved agent credentials to .env.local (Account ID: ${accountIdToSave})`);
  if (accountIdToSave === "0.0.X") {
    console.log("ℹ️  Update 'AGENT_ACCOUNT_ID=0.0.X' in .env.local once your testnet account is created.");
  } else {
    console.log("🎉 Account ID linked successfully! You are ready to start building.");
  }
}

async function main() {
  console.log("========================================================");
  console.log("   💧 Scaffold-HBAR: Auto-Provision Testnet Agent       ");
  console.log("========================================================\n");

  console.log("1. Generating ECDSA (secp256k1) keypair for autonomous agent...");
  const keys = generateAgentKeys();
  console.log(`   ✔ Public Key: ${keys.publicKeyDer}`);
  console.log(`   ✔ EVM Address: ${keys.evmAddress}\n`);

  console.log(`2. Connecting to micro-faucet at: ${DEFAULT_FAUCET_URL}...`);

  try {
    const result = await requestFaucetDispense(DEFAULT_FAUCET_URL, keys.publicKeyDer);

    if (result.success && result.accountId) {
      console.log("\n========================================================");
      console.log("🎉 SUCCESS: Account Provisioned on Hedera Testnet!");
      console.log("========================================================");
      console.log(`🆔 Account ID:     ${result.accountId}`);
      console.log(`💸 Dispensed:      ${result.amountHbar ?? 5} HBAR`);
      console.log(`📜 Transaction ID: ${result.transactionId}`);
      console.log(`🌐 EVM Address:    ${keys.evmAddress}`);
      console.log("========================================================\n");

      writeAgentEnv(keys, result.accountId);
      console.log("💾 Environment files updated:");
      console.log("   - .env.local");
      console.log("   - packages/nextjs/.env.local\n");
      return;
    }

    // Faucet responded with error (e.g. FAUCET_EMPTY or RATE_LIMITED)
    await handleFallback(keys, result.message || result.error || "Faucet rejected request");
  } catch (err: any) {
    // Faucet unreachable, down, or timed out
    const message = err.name === "AbortError"
      ? `Connection timed out after ${REQUEST_TIMEOUT_MS / 1000}s`
      : err.message || "Failed to connect to faucet server";

    await handleFallback(keys, `Service unreachable (${message})`);
  }
}

if (require.main === module) {
  main().catch(err => {
    console.error("❌ Provisioning script encountered an unhandled error:", err);
    process.exit(1);
  });
}
