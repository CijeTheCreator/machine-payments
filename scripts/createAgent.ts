import * as fs from "fs";
import * as path from "path";
import { PrivateKey } from "@hiero-ledger/sdk";
import { parse, stringify } from "envfile";

const ROOT_ENV_PATH = path.resolve(__dirname, "../.env.local");
const NEXTJS_ENV_PATH = path.resolve(__dirname, "../packages/nextjs/.env.local");

export interface AgentKeys {
  privateKey: string;
  publicKeyDer: string;
  publicKeyRaw: string;
  evmAddress: string;
}

export function generateAgentKeys(): AgentKeys {
  const privateKey = PrivateKey.generateECDSA();
  const publicKey = privateKey.publicKey;
  const evmAddress = "0x" + publicKey.toEvmAddress();

  return {
    privateKey: privateKey.toStringDer(),
    publicKeyDer: publicKey.toStringDer(),
    publicKeyRaw: publicKey.toStringRaw(),
    evmAddress,
  };
}

export function writeAgentEnv(keys: AgentKeys, accountId: string = "0.0.X"): void {
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

    currentConfig["AGENT_ACCOUNT_ID"] = accountId;
    currentConfig["AGENT_PRIVATE_KEY"] = keys.privateKey;
    currentConfig["AGENT_PUBLIC_KEY"] = keys.publicKeyDer;
    currentConfig["AGENT_EVM_ADDRESS"] = keys.evmAddress;

    fs.writeFileSync(envPath, stringify(currentConfig));
  }
}

async function main() {
  console.log("=================================================");
  console.log("   🤖 Scaffold-HBAR: Create Autonomous Agent     ");
  console.log("=================================================\n");

  const keys = generateAgentKeys();

  console.log("Generated Agent Keypair (ECDSA secp256k1):");
  console.log("-----------------------------------------");
  console.log(`Public Key (DER Hex): ${keys.publicKeyDer}`);
  console.log(`Public Key (Raw Hex): ${keys.publicKeyRaw}`);
  console.log(`EVM Address:          ${keys.evmAddress}`);
  console.log(`Private Key:          ${keys.privateKey}`);
  console.log("-----------------------------------------\n");

  writeAgentEnv(keys, "0.0.X");

  console.log("✅ Credentials written to:");
  console.log(`   - ${ROOT_ENV_PATH}`);
  console.log(`   - ${NEXTJS_ENV_PATH}`);
  console.log("\n💡 Next Steps:");
  console.log("1. Use the Public Key or EVM Address above to create/fund an account on Hedera Testnet via:");
  console.log("   - Hedera Developer Portal: https://portal.hedera.com/");
  console.log("   - Or run 'yarn script:fund-agent' to auto-fund via micro-faucet.");
  console.log("2. Update AGENT_ACCOUNT_ID in .env.local with your assigned 0.0.X ID once created.\n");
}

if (require.main === module) {
  main().catch(err => {
    console.error("❌ Failed to create agent:", err);
    process.exit(1);
  });
}
