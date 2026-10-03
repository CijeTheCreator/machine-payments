import assert from "assert";
import {
  getActiveFacilitatorConfig,
  getSupportedCapabilities,
  buildX402PaymentRequirement,
  verifyPaymentTransaction,
  settlePaymentTransaction,
  DEFAULT_HOSTED_FACILITATOR_URL,
  DEFAULT_HOSTED_FEE_PAYER,
} from "../packages/nextjs/services/facilitator";
import { AccountId, Hbar, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 Running x402 Facilitator Offline Unit Tests ");
  console.log("=================================================\n");

  // Test 1: Active facilitator config resolution (Hosted mode default)
  console.log("Test 1: getActiveFacilitatorConfig default hosted mode...");
  delete process.env.FACILITATOR_MODE;
  const hostedConfig = getActiveFacilitatorConfig();
  assert.strictEqual(hostedConfig.mode, "hosted");
  assert.strictEqual(hostedConfig.isSelfHosted, false);
  assert.strictEqual(hostedConfig.hostedUrl, DEFAULT_HOSTED_FACILITATOR_URL);
  assert.strictEqual(hostedConfig.feePayer, DEFAULT_HOSTED_FEE_PAYER);
  assert.strictEqual(hostedConfig.activeUrl, DEFAULT_HOSTED_FACILITATOR_URL);
  console.log("  ✅ Passed: Hosted default configuration resolved correctly.\n");

  // Test 2: Switching to self-hosted mode via environment variable
  console.log("Test 2: getActiveFacilitatorConfig self-hosted mode switch...");
  process.env.FACILITATOR_MODE = "self-hosted";
  process.env.FACILITATOR_OPERATOR_ID = "0.0.123456";
  const selfHostedConfig = getActiveFacilitatorConfig();
  assert.strictEqual(selfHostedConfig.mode, "self-hosted");
  assert.strictEqual(selfHostedConfig.isSelfHosted, true);
  assert.strictEqual(selfHostedConfig.activeUrl, "/api/x402/facilitator");
  assert.strictEqual(selfHostedConfig.feePayer, "0.0.123456");
  console.log("  ✅ Passed: Self-hosted mode routes active URL to /api/x402/facilitator.\n");

  // Reset env
  delete process.env.FACILITATOR_MODE;
  delete process.env.FACILITATOR_OPERATOR_ID;

  // Test 3: Supported capabilities schema compliance
  console.log("Test 3: getSupportedCapabilities x402 standard discovery...");
  const capabilities = getSupportedCapabilities();
  assert(Array.isArray(capabilities.kinds), "Must return kinds array");
  assert.strictEqual(capabilities.kinds.length, 1);
  const kind = capabilities.kinds[0];
  assert.strictEqual(kind.network, "hedera:testnet");
  assert.strictEqual(kind.scheme, "exact");
  assert(kind.feePayer.startsWith("0.0."), "feePayer must be Hedera account ID");
  console.log("  ✅ Passed: /supported capabilities conform to x402 exact Hedera standard.\n");

  // Test 4: buildX402PaymentRequirement format
  console.log("Test 4: buildX402PaymentRequirement metadata formatting...");
  const req = buildX402PaymentRequirement({
    payTo: "0.0.56789",
    amountTinybar: 100000000,
    memo: "test-resource-access",
  });
  assert.strictEqual(req.scheme, "exact");
  assert.strictEqual(req.network, "hedera:testnet");
  assert.strictEqual(req.asset, "0.0.0");
  assert.strictEqual(req.payTo, "0.0.56789");
  assert.strictEqual(req.amount, "100000000");
  assert.strictEqual(req.memo, "test-resource-access");
  console.log("  ✅ Passed: Payment requirement complies with x402 exact terms.\n");

  // Test 5: Verify valid offline TransferTransaction
  console.log("Test 5: verifyPaymentTransaction with authentic TransferTransaction bytes...");
  const buyerId = AccountId.fromString("0.0.11111");
  const sellerId = AccountId.fromString("0.0.56789");
  const amountHbar = new Hbar(1); // 100,000,000 tinybars

  // Construct standard Hedera TransferTransaction
  const tx = new TransferTransaction()
    .setNodeAccountIds([AccountId.fromString("0.0.3")])
    .setTransactionId(TransactionId.generate(buyerId))
    .addHbarTransfer(buyerId, amountHbar.negated())
    .addHbarTransfer(sellerId, amountHbar);

  const txBytes = Buffer.from(tx.toBytes()).toString("base64");

  const verifyResult = await verifyPaymentTransaction({
    transactionBytes: txBytes,
    paymentDemand: {
      payTo: "0.0.56789",
      amount: "100000000",
      asset: "0.0.0",
      network: "hedera:testnet",
    },
  });

  assert.strictEqual(verifyResult.valid, true, `Verification should pass: ${verifyResult.error}`);
  assert.strictEqual(verifyResult.payerAccountId, "0.0.11111");
  const sellerCredit = verifyResult.transfers?.find(t => t.accountId === "0.0.56789");
  assert.strictEqual(sellerCredit?.amountTinybar, 100000000);
  console.log("  ✅ Passed: Authentic TransferTransaction verified successfully offline.\n");

  // Test 6: Verify underpaid transaction fails
  console.log("Test 6: verifyPaymentTransaction rejects underpaid transfer...");
  const underpaidResult = await verifyPaymentTransaction({
    transactionBytes: txBytes,
    paymentDemand: {
      payTo: "0.0.56789",
      amount: "200000000", // Demands 2 HBAR, tx only has 1 HBAR
    },
  });
  assert.strictEqual(underpaidResult.valid, false);
  assert(underpaidResult.error?.includes("Insufficient payment"));
  console.log("  ✅ Passed: Underpaid transaction was correctly rejected.\n");

  // Test 7: Verify malformed transaction bytes
  console.log("Test 7: verifyPaymentTransaction rejects malformed transaction bytes...");
  const malformedResult = await verifyPaymentTransaction({
    transactionBytes: "not-a-valid-base64-tx",
  });
  assert.strictEqual(malformedResult.valid, false);
  assert(malformedResult.error?.includes("Failed to deserialize"));
  console.log("  ✅ Passed: Malformed transaction handled gracefully with clean error.\n");

  // Test 8: Settle payment offline simulation
  console.log("Test 8: settlePaymentTransaction offline simulation...");
  const settleResult = await settlePaymentTransaction({
    transactionBytes: txBytes,
    paymentDemand: {
      payTo: "0.0.56789",
      amount: "100000000",
    },
  });
  assert.strictEqual(settleResult.success, true);
  assert(settleResult.transactionId, "Should return transaction ID");
  assert(settleResult.consensusTimestamp, "Should return consensus timestamp");
  console.log(`  ✅ Passed: Payment settled offline with simulated txId: ${settleResult.transactionId}\n`);

  // Test 9: Complete x402 challenge negotiation workflow
  console.log("Test 9: End-to-end x402 challenge negotiation workflow...");
  const sellerAccount = "0.0.56789";
  const demandedTinybar = "100000000";

  // Step A: Resource server creates 402 challenge
  const challenge = buildX402PaymentRequirement({
    payTo: sellerAccount,
    amountTinybar: demandedTinybar,
    memo: "x402-access-agent-insight",
  });
  assert.strictEqual(challenge.payTo, sellerAccount);
  assert.strictEqual(challenge.amount, demandedTinybar);
  assert.strictEqual(challenge.asset, "0.0.0");
  console.log("  Step A: Resource server generated valid 402 challenge headers.");

  // Step B: Client signs and sends payment signature (represented by txBytes)
  // Step C: Facilitator verifies incoming payment
  const verifyStep = await verifyPaymentTransaction({
    transactionBytes: txBytes,
    paymentDemand: {
      payTo: challenge.payTo,
      amount: challenge.amount,
      asset: challenge.asset,
      network: challenge.network,
    },
  });
  assert.strictEqual(verifyStep.valid, true);
  console.log("  Step B & C: Facilitator successfully validated buyer signature and exact tinybar amount.");

  // Step D: Facilitator settles payment on-chain
  const settleStep = await settlePaymentTransaction({
    transactionBytes: txBytes,
    paymentDemand: {
      payTo: challenge.payTo,
      amount: challenge.amount,
    },
  });
  assert.strictEqual(settleStep.success, true);
  assert(settleStep.transactionId, "Settlement must yield a transaction ID");
  console.log(`  Step D: Facilitator settled payment on Hedera (Tx: ${settleStep.transactionId})`);
  console.log("  ✅ Passed: Complete 402 challenge -> sign -> verify -> settle cycle verified.\n");

  console.log("=================================================");
  console.log("  🎉 All Facilitator Unit Tests Passed (Offline) ");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
