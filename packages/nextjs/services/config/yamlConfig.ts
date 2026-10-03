import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

export interface NetworkConfig {
  default: "testnet" | "mainnet" | "previewnet" | "local";
  testnetRpc: string;
  mainnetRpc: string;
  mirrorNode: string;
}

export interface AgentConfig {
  mode: "auto" | "offchain" | "vault";
  currency: string;
  pollingIntervalMs: number;
}

export interface SpendGuardCaps {
  perTaskHbar: number;
  perDayHbar: number;
  autoApprovalLimitHbar: number;
}

export interface SpendGuardConfig {
  caps: SpendGuardCaps;
  allowlist: string[];
  blockedTools: string[];
}

export interface HcsConfig {
  auditTopicMemo: string;
  policyTopicMemo: string;
  enableHip991CustomFees: boolean;
  customFeeTinybar: number;
  auditTopicId?: string;
  policyTopicId?: string;
}

export interface FaucetConfig {
  defaultUrl: string;
  requestTimeoutMs: number;
}

export interface AppScaffoldConfig {
  network: NetworkConfig;
  agent: AgentConfig;
  spendGuard: SpendGuardConfig;
  hcs: HcsConfig;
  faucet: FaucetConfig;
  vault?: {
    address?: string;
  };
}

export const DEFAULT_SCAFFOLD_CONFIG: AppScaffoldConfig = {
  network: {
    default: "testnet",
    testnetRpc: "https://testnet.hashio.io/api",
    mainnetRpc: "https://mainnet.hashio.io/api",
    mirrorNode: "https://testnet.mirrornode.hedera.com",
  },
  agent: {
    mode: "auto",
    currency: "HBAR",
    pollingIntervalMs: 10000,
  },
  spendGuard: {
    caps: {
      perTaskHbar: 5,
      perDayHbar: 50,
      autoApprovalLimitHbar: 5,
    },
    allowlist: ["0.0.56789"],
    blockedTools: ["delete_account", "freeze_token", "wipe_token", "approve_allowance", "delete_allowance"],
  },
  hcs: {
    auditTopicMemo: "agent-spend-audit",
    policyTopicMemo: "hcs-2:0:86400",
    enableHip991CustomFees: false,
    customFeeTinybar: 0,
  },
  faucet: {
    defaultUrl: "http://localhost:3001",
    requestTimeoutMs: 6000,
  },
};

function findConfigFile(): string | null {
  const candidates = [
    path.resolve(process.cwd(), "scaffold.config.yaml"),
    path.resolve(process.cwd(), "..", "scaffold.config.yaml"),
    path.resolve(process.cwd(), "..", "..", "scaffold.config.yaml"),
  ];

  for (const candidate of candidates) {
    try {
      if (fs.existsSync(candidate)) {
        return candidate;
      }
    } catch {
      // In browser/restricted environments, ignore filesystem errors
    }
  }
  return null;
}

/**
 * Loads the root scaffold.config.yaml configuration and applies environment variable overrides.
 */
export function loadYamlConfig(): AppScaffoldConfig {
  let fileConfig: Partial<AppScaffoldConfig> = {};

  try {
    const configPath = findConfigFile();
    if (configPath) {
      const raw = fs.readFileSync(configPath, "utf-8");
      const parsed = yaml.parse(raw);
      if (parsed && typeof parsed === "object") {
        fileConfig = parsed;
      }
    }
  } catch (err) {
    console.warn("Notice: scaffold.config.yaml not found or unreadable, falling back to defaults.", err);
  }

  // Deep merge defaults with file config
  const config: AppScaffoldConfig = {
    network: {
      ...DEFAULT_SCAFFOLD_CONFIG.network,
      ...(fileConfig.network || {}),
    },
    agent: {
      ...DEFAULT_SCAFFOLD_CONFIG.agent,
      ...(fileConfig.agent || {}),
    },
    spendGuard: {
      caps: {
        ...DEFAULT_SCAFFOLD_CONFIG.spendGuard.caps,
        ...(fileConfig.spendGuard?.caps || {}),
      },
      allowlist: [...new Set([...(fileConfig.spendGuard?.allowlist || DEFAULT_SCAFFOLD_CONFIG.spendGuard.allowlist)])],
      blockedTools: [
        ...new Set([...(fileConfig.spendGuard?.blockedTools || DEFAULT_SCAFFOLD_CONFIG.spendGuard.blockedTools)]),
      ],
    },
    hcs: {
      ...DEFAULT_SCAFFOLD_CONFIG.hcs,
      ...(fileConfig.hcs || {}),
    },
    faucet: {
      ...DEFAULT_SCAFFOLD_CONFIG.faucet,
      ...(fileConfig.faucet || {}),
    },
    vault: {
      address: process.env.VAULT_CONTRACT_ID || process.env.NEXT_PUBLIC_VAULT_ADDRESS,
    },
  };

  // Environment variable overrides
  if (process.env.HEDERA_NETWORK) {
    config.network.default = process.env.HEDERA_NETWORK as any;
  }
  if (process.env.GUARD_MODE || process.env.AGENT_SPEND_MODE) {
    config.agent.mode = (process.env.GUARD_MODE || process.env.AGENT_SPEND_MODE) as any;
  }
  if (process.env.AGENT_PER_TASK_CAP) {
    const parsed = parseFloat(process.env.AGENT_PER_TASK_CAP);
    if (!isNaN(parsed)) config.spendGuard.caps.perTaskHbar = parsed;
  }
  if (process.env.AGENT_PER_DAY_CAP) {
    const parsed = parseFloat(process.env.AGENT_PER_DAY_CAP);
    if (!isNaN(parsed)) config.spendGuard.caps.perDayHbar = parsed;
  }
  if (process.env.ALLOWLISTED_ACCOUNTS) {
    const accounts = process.env.ALLOWLISTED_ACCOUNTS.split(",")
      .map(s => s.trim())
      .filter(Boolean);
    config.spendGuard.allowlist = [...new Set([...config.spendGuard.allowlist, ...accounts])];
  }
  const auditTopic =
    process.env.HCS_AUDIT_TOPIC_ID || process.env.NEXT_PUBLIC_HCS_AUDIT_TOPIC_ID || process.env.AUDIT_TOPIC_ID;
  if (auditTopic) {
    config.hcs.auditTopicId = auditTopic;
  }
  const policyTopic =
    process.env.HCS_POLICY_TOPIC_ID || process.env.NEXT_PUBLIC_HCS_POLICY_TOPIC_ID || process.env.POLICY_TOPIC_ID;
  if (policyTopic) {
    config.hcs.policyTopicId = policyTopic;
  }
  if (process.env.FAUCET_URL) {
    config.faucet.defaultUrl = process.env.FAUCET_URL;
  }

  return config;
}
