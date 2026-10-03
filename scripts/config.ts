import * as fs from "fs";
import * as path from "path";
import * as yaml from "yaml";

export interface ScriptScaffoldConfig {
  network: {
    default: string;
    testnetRpc: string;
    mainnetRpc: string;
    mirrorNode: string;
  };
  agent: {
    mode: string;
    currency: string;
    pollingIntervalMs: number;
  };
  spendGuard: {
    caps: {
      perTaskHbar: number;
      perDayHbar: number;
      autoApprovalLimitHbar: number;
    };
    allowlist: string[];
    blockedTools: string[];
  };
  hcs: {
    auditTopicMemo: string;
    policyTopicMemo: string;
    enableHip991CustomFees: boolean;
    customFeeTinybar: number;
    auditTopicId?: string;
    policyTopicId?: string;
  };
  faucet: {
    defaultUrl: string;
    requestTimeoutMs: number;
  };
}

export function loadScriptConfig(): ScriptScaffoldConfig {
  const configPath = path.resolve(process.cwd(), "scaffold.config.yaml");
  let fileConfig: any = {};
  if (fs.existsSync(configPath)) {
    try {
      fileConfig = yaml.parse(fs.readFileSync(configPath, "utf-8")) || {};
    } catch {
      // Fall back to defaults
    }
  }

  return {
    network: {
      default: process.env.HEDERA_NETWORK || fileConfig.network?.default || "testnet",
      testnetRpc: fileConfig.network?.testnetRpc || "https://testnet.hashio.io/api",
      mainnetRpc: fileConfig.network?.mainnetRpc || "https://mainnet.hashio.io/api",
      mirrorNode: fileConfig.network?.mirrorNode || "https://testnet.mirrornode.hedera.com",
    },
    agent: {
      mode: process.env.GUARD_MODE || fileConfig.agent?.mode || "auto",
      currency: fileConfig.agent?.currency || "HBAR",
      pollingIntervalMs: fileConfig.agent?.pollingIntervalMs || 10000,
    },
    spendGuard: {
      caps: {
        perTaskHbar: parseFloat(process.env.AGENT_PER_TASK_CAP || "") || fileConfig.spendGuard?.caps?.perTaskHbar || 5,
        perDayHbar: parseFloat(process.env.AGENT_PER_DAY_CAP || "") || fileConfig.spendGuard?.caps?.perDayHbar || 50,
        autoApprovalLimitHbar: fileConfig.spendGuard?.caps?.autoApprovalLimitHbar || 5,
      },
      allowlist: fileConfig.spendGuard?.allowlist || ["0.0.56789"],
      blockedTools: fileConfig.spendGuard?.blockedTools || [
        "delete_account",
        "freeze_token",
        "wipe_token",
        "approve_allowance",
        "delete_allowance",
      ],
    },
    hcs: {
      auditTopicMemo: fileConfig.hcs?.auditTopicMemo || "agent-spend-audit",
      policyTopicMemo: fileConfig.hcs?.policyTopicMemo || "hcs-2:0:86400",
      enableHip991CustomFees: !!fileConfig.hcs?.enableHip991CustomFees,
      customFeeTinybar: fileConfig.hcs?.customFeeTinybar || 0,
      auditTopicId: process.env.AUDIT_TOPIC_ID || fileConfig.hcs?.auditTopicId,
      policyTopicId: process.env.POLICY_TOPIC_ID || fileConfig.hcs?.policyTopicId,
    },
    faucet: {
      defaultUrl: process.env.FAUCET_URL || fileConfig.faucet?.defaultUrl || "http://localhost:3001",
      requestTimeoutMs: fileConfig.faucet?.requestTimeoutMs || 6000,
    },
  };
}
