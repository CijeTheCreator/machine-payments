export interface AccountBalanceInfo {
  hbar: string;
  tinybar: string;
  error?: string | null;
}

const DEFAULT_MIRROR_NODE = process.env.NEXT_PUBLIC_HEDERA_MIRROR_NODE_URL || "https://testnet.mirrornode.hedera.com";

/**
 * Fetches HBAR balance from the Hedera Mirror Node for an Account ID (0.0.X)
 * or EVM Address (0x...). Safe against offline environments and un-activated accounts.
 */
export async function fetchHederaAccountBalance(
  accountIdOrEvm: string,
  mirrorNodeUrl: string = DEFAULT_MIRROR_NODE,
): Promise<AccountBalanceInfo> {
  if (!accountIdOrEvm) {
    return { hbar: "0", tinybar: "0" };
  }

  try {
    const cleanUrl = mirrorNodeUrl.replace(/\/$/, "");
    const res = await fetch(`${cleanUrl}/api/v1/accounts/${accountIdOrEvm}`, {
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(4000),
    });

    if (!res.ok) {
      return { hbar: "0", tinybar: "0" };
    }

    const data = await res.json();
    const tinybarNum = data.balance?.balance ?? 0;
    const hbarNum = tinybarNum / 1e8;

    return {
      hbar: hbarNum.toFixed(4),
      tinybar: tinybarNum.toString(),
    };
  } catch (err) {
    return {
      hbar: "0",
      tinybar: "0",
      error: (err as Error).message || "offline",
    };
  }
}
