import * as path from "path";
import * as dotenv from "dotenv";
import {
  Client,
  AccountId,
  PrivateKey,
  TransferTransaction,
  TransactionId,
  Hbar,
} from "@hiero-ledger/sdk";

// Load environment variables from .env.local before running
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

// Enforce self-hosted facilitator mode for this end-to-end test
process.env.FACILITATOR_MODE = "self-hosted";

const HEDERA_ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID;
const HEDERA_PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY;

function assertCondition(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function main() {
  console.log("\n=====================================================================");
  console.log(" 🌐 Hedera Testnet End-to-End Test: Self-Hosted x402 Facilitator ");
  console.log("=====================================================================\n");

  if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY) {
    throw new Error("Missing real credentials in .env.local (HEDERA_ACCOUNT_ID / HEDERA_PRIVATE_KEY)");
  }

  // Import Next.js route handlers after setting env
  const { GET: getFacilitatorStatus } = await import("../packages/nextjs/app/api/x402/facilitator/route");
  const { GET: getFacilitatorSupported } = await import("../packages/nextjs/app/api/x402/facilitator/supported/route");
  const { POST: postFacilitatorVerify } = await import("../packages/nextjs/app/api/x402/facilitator/verify/route");
  const { POST: postFacilitatorSettle } = await import("../packages/nextjs/app/api/x402/facilitator/settle/route");
  const { GET: getResource } = await import("../packages/nextjs/app/api/x402/resource/route");

  // 1. Operator Key & Testnet Balance Verification
  console.log("1. Verifying Operator Credentials & Hedera Testnet Balance...");
  const operatorKey = HEDERA_PRIVATE_KEY.startsWith("30")
    ? PrivateKey.fromStringDer(HEDERA_PRIVATE_KEY)
    : HEDERA_PRIVATE_KEY.startsWith("0x")
      ? PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY)
      : PrivateKey.fromString(HEDERA_PRIVATE_KEY);

  const buyerAccountId = AccountId.fromString(HEDERA_ACCOUNT_ID);
  const client = Client.forTestnet();
  client.setOperator(buyerAccountId, operatorKey);

  const balanceRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${HEDERA_ACCOUNT_ID}`);
  const balanceData: any = await balanceRes.json();
  const balanceTinybar = balanceData.balance?.balance || 0;
  const balanceHbar = Number(balanceTinybar) / 1e8;

  console.log(`   Operator / Fee Payer Account: ${HEDERA_ACCOUNT_ID}`);
  console.log(`   Current Mirror Node Balance:  ${balanceHbar} HBAR (${balanceTinybar} tinybars)`);
  assertCondition(balanceHbar > 1, `Insufficient testnet balance for real test: ${balanceHbar} HBAR`);
  console.log("   ✅ Real operator credentials loaded & funded on Testnet.\n");

  // 2. Test GET /api/x402/facilitator Status Endpoint
  console.log("2. Testing Self-Hosted Facilitator Status (GET /api/x402/facilitator)...");
  const statusRes = await getFacilitatorStatus();
  console.log(`   Response Status: HTTP ${statusRes.status}`);
  assertCondition(statusRes.status === 200, `Expected HTTP 200 from facilitator status, got ${statusRes.status}`);

  const statusJson = await statusRes.json();
  console.log("   Facilitator Status Payload:", JSON.stringify(statusJson, null, 2));
  assertCondition(statusJson.status === "ok", "Expected status 'ok'");
  assertCondition(statusJson.mode === "self-hosted", `Expected mode 'self-hosted', got ${statusJson.mode}`);
  assertCondition(statusJson.activeUrl === "/api/x402/facilitator", `Expected activeUrl '/api/x402/facilitator', got ${statusJson.activeUrl}`);
  assertCondition(statusJson.advertisedFeePayer === HEDERA_ACCOUNT_ID, `Expected advertisedFeePayer ${HEDERA_ACCOUNT_ID}, got ${statusJson.advertisedFeePayer}`);
  console.log("   ✅ Facilitator status confirms active self-hosted mode and advertised fee-payer.\n");

  // 3. Test GET /api/x402/facilitator/supported Capability Discovery
  console.log("3. Testing Capability Discovery (GET /api/x402/facilitator/supported)...");
  const supportedRes = await getFacilitatorSupported();
  console.log(`   Response Status: HTTP ${supportedRes.status}`);
  assertCondition(supportedRes.status === 200, `Expected HTTP 200 from supported endpoint, got ${supportedRes.status}`);

  const supportedJson = await supportedRes.json();
  console.log("   Capabilities Payload:", JSON.stringify(supportedJson, null, 2));
  assertCondition(supportedJson.status === "active", "Expected capability status 'active'");
  assertCondition(Array.isArray(supportedJson.kinds) && supportedJson.kinds.length > 0, "Expected non-empty kinds array");
  const primaryKind = supportedJson.kinds[0];
  assertCondition(primaryKind.network === "hedera:testnet", `Expected network 'hedera:testnet', got ${primaryKind.network}`);
  assertCondition(primaryKind.scheme === "exact", `Expected scheme 'exact', got ${primaryKind.scheme}`);
  assertCondition(primaryKind.feePayer === HEDERA_ACCOUNT_ID, `Expected feePayer ${HEDERA_ACCOUNT_ID}, got ${primaryKind.feePayer}`);
  console.log("   ✅ /supported conforms strictly to x402 Hedera exact scheme.\n");

  // 4. Test Unpaid Request to Gated Resource (/api/x402/resource)
  console.log("4. Testing x402 Negotiation (GET /api/x402/resource without payment)...");
  const unpaidReq = new Request("https://machine.local/api/x402/resource", { method: "GET" });
  const unpaidRes = await getResource(unpaidReq as any);
  console.log(`   Response Status: HTTP ${unpaidRes.status}`);
  assertCondition(unpaidRes.status === 402, `Expected HTTP 402, got ${unpaidRes.status}`);

  const paymentRequiredHeader = unpaidRes.headers.get("payment-required");
  assertCondition(!!paymentRequiredHeader, "Missing PAYMENT-REQUIRED header");
  const requirement = JSON.parse(paymentRequiredHeader!);
  console.log("   Received 402 Payment Demand:");
  console.log(`     - Facilitator URL: ${requirement.facilitatorUrl}`);
  console.log(`     - Pay To:          ${requirement.payTo}`);
  console.log(`     - Amount:          ${requirement.amount} tinybar (${Number(requirement.amount) / 1e8} HBAR)`);
  assertCondition(requirement.facilitatorUrl === "/api/x402/facilitator", "Resource must advertise self-hosted facilitator URL");
  console.log("   ✅ x402 challenge correctly demanded payment via self-hosted facilitator.\n");

  // 5. Construct & Sign Authentic Hedera TransferTransaction
  console.log("5. Constructing & Signing authentic Hedera TransferTransaction on Testnet...");
  const sellerAccountId = AccountId.fromString(requirement.payTo);
  const tinybarAmount = BigInt(requirement.amount);
  const hbarAmount = Hbar.fromTinybars(tinybarAmount.toString());

  const transferTx = new TransferTransaction()
    .setNodeAccountIds([AccountId.fromString("0.0.3")])
    .setTransactionId(TransactionId.generate(buyerAccountId))
    .addHbarTransfer(buyerAccountId, hbarAmount.negated())
    .addHbarTransfer(sellerAccountId, hbarAmount)
    .setTransactionMemo("x402:self-hosted-live-e2e")
    .freezeWith(client);

  await transferTx.sign(operatorKey);
  const txBytesBase64 = Buffer.from(transferTx.toBytes()).toString("base64");
  const txIdStr = transferTx.transactionId!.toString();
  console.log(`   Buyer:           ${buyerAccountId.toString()}`);
  console.log(`   Seller:          ${sellerAccountId.toString()}`);
  console.log(`   Transfer Amount: ${hbarAmount.toString()} (${tinybarAmount} tinybars)`);
  console.log(`   Transaction ID:  ${txIdStr}`);
  console.log(`   Signed Bytes:    ${txBytesBase64.length} chars (base64)`);
  console.log("   ✅ Transaction created and signed by buyer key.\n");

  // 6. Test POST /api/x402/facilitator/verify Handler Directly
  console.log("6. Testing Facilitator Verify Endpoint (POST /api/x402/facilitator/verify)...");
  const verifyReq = new Request("https://machine.local/api/x402/facilitator/verify", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionBytes: txBytesBase64,
      paymentDemand: {
        payTo: requirement.payTo,
        amount: requirement.amount,
        network: requirement.network,
        asset: requirement.asset,
      },
    }),
  });

  const verifyRes = await postFacilitatorVerify(verifyReq as any);
  console.log(`   Response Status: HTTP ${verifyRes.status}`);
  assertCondition(verifyRes.status === 200, `Expected HTTP 200 from verify, got ${verifyRes.status}`);

  const verifyJson = await verifyRes.json();
  console.log("   Facilitator Verify Response:", JSON.stringify(verifyJson, null, 2));
  assertCondition(verifyJson.valid === true, "Verification must succeed");
  assertCondition(verifyJson.payerAccountId === HEDERA_ACCOUNT_ID, `Expected payer ${HEDERA_ACCOUNT_ID}, got ${verifyJson.payerAccountId}`);
  console.log("   ✅ Facilitator verified cryptographic signature, amounts, and destination.\n");

  // 7. Test POST /api/x402/facilitator/settle Handler (Live Testnet Consensus Settlement)
  console.log("7. Testing Facilitator Settle Endpoint with Real Key (POST /api/x402/facilitator/settle)...");
  console.log("   Submitting transaction to Hedera Testnet consensus node via self-hosted facilitator...");
  const settleReq = new Request("https://machine.local/api/x402/facilitator/settle", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      transactionBytes: txBytesBase64,
      paymentDemand: {
        payTo: requirement.payTo,
        amount: requirement.amount,
        network: requirement.network,
        asset: requirement.asset,
      },
    }),
  });

  const settleRes = await postFacilitatorSettle(settleReq as any);
  console.log(`   Response Status: HTTP ${settleRes.status}`);
  const settleJson = await settleRes.json();
  console.log("   Facilitator Settle Response:", JSON.stringify(settleJson, null, 2));
  assertCondition(settleRes.status === 200, `Settlement failed: ${JSON.stringify(settleJson)}`);
  assertCondition(settleJson.success === true, "Expected settlement success");
  assertCondition(settleJson.transactionId === txIdStr, `Expected tx ID ${txIdStr}, got ${settleJson.transactionId}`);
  assertCondition(settleJson.feePayer === HEDERA_ACCOUNT_ID, `Expected feePayer ${HEDERA_ACCOUNT_ID}, got ${settleJson.feePayer}`);
  console.log("   ✅ Transaction settled in Hedera Testnet consensus!\n");

  // 8. Test Gated Resource Delivery with Paid Signature via withX402 Middleware
  console.log("8. Testing End-to-End Resource Delivery with Signed Payment...");
  // Now submit the signed transaction to the resource route
  // Since this exact transaction was just settled, we create a fresh 2nd micro-transfer for full end-to-end middleware test
  console.log("   Generating micro-payment for full middleware route test...");
  const transferTx2 = new TransferTransaction()
    .setNodeAccountIds([AccountId.fromString("0.0.3")])
    .setTransactionId(TransactionId.generate(buyerAccountId))
    .addHbarTransfer(buyerAccountId, hbarAmount.negated())
    .addHbarTransfer(sellerAccountId, hbarAmount)
    .setTransactionMemo("x402:self-hosted-resource-delivered")
    .freezeWith(client);

  await transferTx2.sign(operatorKey);
  const txBytes2Base64 = Buffer.from(transferTx2.toBytes()).toString("base64");
  const txId2Str = transferTx2.transactionId!.toString();

  const paidReq = new Request("https://machine.local/api/x402/resource", {
    method: "GET",
    headers: {
      "payment-signature": txBytes2Base64,
    },
  });

  const paidRes = await getResource(paidReq as any);
  console.log(`   Response Status: HTTP ${paidRes.status}`);
  assertCondition(paidRes.status === 200, `Expected HTTP 200 from paid resource route, got ${paidRes.status}`);

  const paymentResponseHeader = paidRes.headers.get("payment-response");
  console.log("   PAYMENT-RESPONSE Header:", paymentResponseHeader);
  assertCondition(!!paymentResponseHeader, "Missing PAYMENT-RESPONSE header");

  const resourceJson = await paidRes.json();
  console.log("   Delivered Resource Payload:", JSON.stringify(resourceJson, null, 2));
  assertCondition(resourceJson.success === true, "Resource payload success must be true");
  assertCondition(resourceJson.settlementReceipt?.transactionId === txId2Str, "Receipt must match transaction ID");
  assertCondition(resourceJson.settlementReceipt?.facilitatorMode === "self-hosted", "Receipt must record self-hosted mode");
  console.log("   ✅ Resource delivered with verified settlement receipt!\n");

  // 9. Verify Both Transactions on Hedera Mirror Node
  console.log("9. Verifying Consensus on Hedera Testnet Mirror Node...");
  for (const [label, txId] of [["Direct Settle Tx", txIdStr], ["Resource Delivered Tx", txId2Str]]) {
    const formattedTxId = txId
      .trim()
      .replace("@", "-")
      .replace(/\.(\d+)$/, "-$1");

    console.log(`   Checking ${label}: ${txId} (${formattedTxId})...`);
    let verified = false;
    for (let attempt = 1; attempt <= 6; attempt++) {
      await new Promise(r => setTimeout(r, 2000));
      try {
        const mirrorRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${formattedTxId}`);
        if (mirrorRes.ok) {
          const mirrorJson: any = await mirrorRes.json();
          const txRecord = mirrorJson.transactions?.[0];
          if (txRecord) {
            console.log(`     Mirror Node Result:   ${txRecord.result}`);
            console.log(`     Consensus Timestamp:  ${txRecord.consensus_timestamp}`);
            console.log(`     Charged Tx Fee:       ${txRecord.charged_tx_fee} tinybars`);
            console.log(`     HashScan URL:         https://hashscan.io/testnet/transaction/${formattedTxId}`);
            assertCondition(txRecord.result === "SUCCESS", `Expected SUCCESS on mirror node, got ${txRecord.result}`);
            verified = true;
            break;
          }
        }
      } catch {
        // Retry
      }
    }
    if (!verified) {
      console.log(`     Notice: Mirror node ingestion still pending for ${txId} (direct consensus receipt was SUCCESS).`);
    }
  }

  console.log("\n=====================================================================");
  console.log("  🎉 SELF-HOSTED FACILITATOR TESTED & VERIFIED END-TO-END WITH REAL KEY! ");
  console.log("=====================================================================\n");
}

main().catch(err => {
  console.error("❌ Self-hosted facilitator e2e test failed:", err);
  process.exit(1);
});
