import * as path from "path";
import * as dotenv from "dotenv";
dotenv.config();
dotenv.config({ path: path.resolve(__dirname, "../../.env.local") });
dotenv.config({ path: path.resolve(__dirname, ".env.local") });

import { HardhatUserConfig, task } from "hardhat/config";
import "@nomicfoundation/hardhat-ethers";
import "@nomicfoundation/hardhat-chai-matchers";
import "@typechain/hardhat";
import "hardhat-gas-reporter";
import "solidity-coverage";
// Only load the Hedera forking plugin when starting the local node (yarn hardhat:chain / yarn hardhat:fork).
// Deploying to an already-running node doesn't need it and would fail with EADDRINUSE.
if (process.env.HEDERA_FORKING === "true") {
  // eslint-disable-next-line @typescript-eslint/no-require-imports -- conditional plugin load
  require("@hashgraph/system-contracts-forking/plugin");
}
import "hardhat-deploy";
import "hardhat-deploy-ethers";

import generateTsAbis from "./scripts/generateTsAbis";

// Hedera JSON-RPC URL (testnet default). Set HEDERA_RPC_URL in .env for mainnet.
const hederaRpcUrl = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";

function resolveDeployerPrivateKey(): string {
  if (process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY) {
    return process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY;
  }
  const candidate = process.env.AGENT_PRIVATE_KEY || process.env.HEDERA_OPERATOR_PRIVATE_KEY;
  if (candidate) {
    if (candidate.startsWith("0x") && candidate.length === 66) {
      return candidate;
    }
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      const { PrivateKey } = require("@hiero-ledger/sdk");
      const parsed = PrivateKey.fromString(candidate);
      return "0x" + parsed.toStringRaw();
    } catch {
      // fallback
    }
  }
  return "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
}

const deployerPrivateKey = resolveDeployerPrivateKey();

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    ],
  },
  defaultNetwork: "hardhat",
  namedAccounts: {
    deployer: {
      default: 0,
    },
  },
  networks: {
    hardhat: {
      saveDeployments: true,
      ...(process.env.HEDERA_FORKING === "true"
        ? {
            forking: {
              url: hederaRpcUrl,
              // @ts-expect-error - custom property for hedera-forking plugin
              chainId: 296,
              workerPort: 10001,
            },
          }
        : {}),
    },
    localhost: {
      url: "http://127.0.0.1:8545",
      saveDeployments: true,
    },
    hederaTestnet: {
      url: "https://testnet.hashio.io/api",
      accounts: [deployerPrivateKey],
      chainId: 296,
    },
    hederaMainnet: {
      url: "https://mainnet.hashio.io/api",
      accounts: [deployerPrivateKey],
      chainId: 295,
    },
  },
  // Contract verification: use `yarn verify:contract` (scripts/verifySourcify.ts), which talks
  // directly to the Sourcify API v2. @nomicfoundation/hardhat-verify is intentionally not used:
  // its Hardhat 2-compatible line only speaks the Sourcify API v1, which Sourcify removed in
  // July 2026. See: https://docs.sourcify.dev/blog/api-v1-brownouts/
  typechain: {
    outDir: "typechain-types",
    target: "ethers-v6",
  },
};

// Extend the deploy task to also generate TypeScript ABIs after deployment.
task("deploy").setAction(async (args, hre, runSuper) => {
  await runSuper(args);
  await generateTsAbis(hre);
});

export default config;
