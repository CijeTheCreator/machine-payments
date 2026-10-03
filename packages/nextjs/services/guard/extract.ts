/**
 * Extracts recipient and amount from various Hedera Agent Kit tool parameters.
 */
export interface ExtractedTransfer {
  to?: string;
  amountHbar?: number;
  memo?: string;
}

export function extractTransferDetails(params: any): ExtractedTransfer {
  if (!params || typeof params !== "object") {
    return {};
  }

  // Find recipient account ID
  const to =
    params.receiverAccountId ||
    params.accountId ||
    params.recipientId ||
    params.recipient ||
    params.to ||
    params.targetAccountId;

  // Find amount
  let amountHbar: number | undefined;

  if (typeof params.amount === "number") {
    amountHbar = params.amount;
  } else if (typeof params.amountHbar === "number") {
    amountHbar = params.amountHbar;
  } else if (typeof params.amount === "string") {
    const parsed = parseFloat(params.amount);
    if (!isNaN(parsed)) amountHbar = parsed;
  } else if (typeof params.amountTinybar === "bigint" || typeof params.amountTinybar === "number") {
    amountHbar = Number(params.amountTinybar) / 1e8;
  }

  const memo = typeof params.memo === "string" ? params.memo : undefined;

  return {
    to: typeof to === "string" ? to.trim() : undefined,
    amountHbar,
    memo,
  };
}
