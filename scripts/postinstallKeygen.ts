import * as fs from "fs";
import * as path from "path";
import { PrivateKey } from "@hiero-ledger/sdk";
import { parse, stringify } from "envfile";

const ROOT_ENV_PATH = path.resolve(__dirname, "../.env.local");
const NEXTJS_ENV_PATH = path.resolve(__dirname, "../packages/nextjs/.env.local");

export interface GeneratedKeys {
  privateKey: string;
  publicKeyDer: string;
  publicKeyRaw: string;
  evmAddress: string;
}

export function generateLocalKeys(): GeneratedKeys {
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

export function writeLocalEnv(keys: GeneratedKeys, accountId: string = "0.0.X"): void {
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

    if (!currentConfig["AGENT_ACCOUNT_ID"] || currentConfig["AGENT_ACCOUNT_ID"] === "0.0.X") {
      currentConfig["AGENT_ACCOUNT_ID"] = accountId;
    }
    if (!currentConfig["AGENT_PRIVATE_KEY"]) {
      currentConfig["AGENT_PRIVATE_KEY"] = keys.privateKey;
    }
    if (!currentConfig["AGENT_PUBLIC_KEY"]) {
      currentConfig["AGENT_PUBLIC_KEY"] = keys.publicKeyDer;
    }
    if (!currentConfig["AGENT_EVM_ADDRESS"]) {
      currentConfig["AGENT_EVM_ADDRESS"] = keys.evmAddress;
    }
    if (!currentConfig["HEDERA_NETWORK"]) {
      currentConfig["HEDERA_NETWORK"] = "testnet";
    }

    fs.mkdirSync(path.dirname(envPath), { recursive: true });
    fs.writeFileSync(envPath, stringify(currentConfig));
  }
}

export function runPostinstall(): void {
  // If .env.local already exists with a private key, don't overwrite
  if (fs.existsSync(ROOT_ENV_PATH)) {
    try {
      const content = parse(fs.readFileSync(ROOT_ENV_PATH, "utf-8")) as Record<string, string>;
      if (content["AGENT_PRIVATE_KEY"] && content["AGENT_PRIVATE_KEY"].trim() !== "") {
        return; // Already configured
      }
    } catch {
      // Continue to generate
    }
  }

  const keys = generateLocalKeys();
  writeLocalEnv(keys, "0.0.X");

  console.log("\n" + "=".repeat(76));
  console.log("  🔑 Scaffold-HBAR: Testnet Credentials Initialized (.env.local)");
  console.log("=".repeat(76));
  console.log(`  EVM Address (Alias): ${keys.evmAddress}`);
  console.log(`  Private Key (DER):   ${keys.privateKey}`);
  console.log("\n  Before running 'yarn script:prepare', please fund your account:");
  console.log("  Option 1: Request testnet HBAR from the Hedera Portal Faucet:");
  console.log("            🔗 https://portal.hedera.com/faucet");
  console.log(`            Enter your address: ${keys.evmAddress}`);
  console.log("  Option 2: Replace AGENT_ACCOUNT_ID and AGENT_PRIVATE_KEY in .env.local");
  console.log("            with your existing credentials from https://portal.hedera.com");
  console.log("=".repeat(76) + "\n");
}

if (require.main === module) {
  runPostinstall();
}
