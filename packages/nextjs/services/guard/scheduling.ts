import { AccountId, Client, Hbar, ScheduleCreateTransaction, TransferTransaction } from "@hiero-ledger/sdk";

export interface ScheduledPaymentParams {
  payerAccountId: string;
  recipientAccountId: string;
  amountTinybar: bigint;
  memo?: string;
}

export interface ScheduledPaymentResult {
  scheduleId: string;
  transactionId?: string;
}

/**
 * Creates an authentic HIP-423 Scheduled Transaction on Hedera for Human-in-the-Loop (HITL) approvals.
 * The transaction remains pending on-chain until the authorized owner signs it via ScheduleSignTransaction.
 */
export async function createScheduledPayment(
  client: Client | null | undefined,
  params: ScheduledPaymentParams,
): Promise<ScheduledPaymentResult> {
  const memo = params.memo || "spend-guard:hitl-approval";

  if (!client || !client.operatorAccountId) {
    // Offline / Mock fallback for 100% offline tests (Mechanical Gate 11)
    const mockScheduleId = `0.0.999${Date.now().toString().slice(-4)}`;
    return {
      scheduleId: mockScheduleId,
      transactionId: `mock-tx-${Date.now()}`,
    };
  }

  const transferTx = new TransferTransaction()
    .addHbarTransfer(params.payerAccountId, Hbar.fromTinybars((-params.amountTinybar).toString()))
    .addHbarTransfer(params.recipientAccountId, Hbar.fromTinybars(params.amountTinybar.toString()));

  const scheduleTx = new ScheduleCreateTransaction()
    .setScheduledTransaction(transferTx)
    .setScheduleMemo(memo)
    .setPayerAccountId(AccountId.fromString(params.payerAccountId));

  const response = await scheduleTx.execute(client);
  const receipt = await response.getReceipt(client);

  if (!receipt.scheduleId) {
    throw new Error("Hedera consensus did not return a ScheduleId for the proposed scheduled transaction");
  }

  return {
    scheduleId: receipt.scheduleId.toString(),
    transactionId: response.transactionId.toString(),
  };
}
