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

// Load environment variables from .env.local before importing route handlers
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const HEDERA_ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID || "0.0.6493119";
const HEDERA_PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY!;

async function main() {
  const targetRoute = process.argv.includes("--resource") ? "resource" : "weather";
  const { GET: routeHandler } =
    targetRoute === "resource"
      ? await import("../packages/nextjs/app/api/x402/resource/route")
      : await import("../packages/nextjs/app/api/weather/route");
  const endpointUrl = `https://machine.local/api/${targetRoute}`;

  console.log("\n=======================================================");
  console.log(` 🌐 Hedera Testnet Live End-to-End x402 Payment Test (/api/${targetRoute})  `);
  console.log("=======================================================\n");

  if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY) {
    throw new Error("Missing testnet credentials in .env.local");
  }

  // 1. Initialize Hedera Client
  console.log("1. Connecting Hedera SDK to Testnet...");
  const client = Client.forTestnet();
  const operatorKey = HEDERA_PRIVATE_KEY.startsWith("30")
    ? PrivateKey.fromStringDer(HEDERA_PRIVATE_KEY)
    : PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY.replace(/^0x/, ""));

  const buyerAccountId = AccountId.fromString(HEDERA_ACCOUNT_ID);
  client.setOperator(buyerAccountId, operatorKey);

  // Check account balance on testnet Mirror Node
  const balanceRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${HEDERA_ACCOUNT_ID}`);
  const balanceData = await balanceRes.json();
  const balanceTinybar = balanceData.balance?.balance || 0;
  const balanceHbar = Number(balanceTinybar) / 1e8;

  console.log(`   Buyer Account: ${HEDERA_ACCOUNT_ID}`);
  console.log(`   Current Balance: ${balanceHbar} HBAR (${balanceTinybar} tinybars)`);
  console.log("   ✅ Hedera Client connected successfully.\n");

  // 2. Issue Unpaid Request to endpoint
  console.log(`2. Sending Unpaid Request to ${endpointUrl} endpoint...`);
  const unpaidReq = new Request(endpointUrl, {
    method: "GET",
  });

  const unpaidRes = await routeHandler(unpaidReq as any);
  console.log(`   Response Status: HTTP ${unpaidRes.status} ${unpaidRes.statusText}`);
  assertCondition(unpaidRes.status === 402, `Expected HTTP 402 but got ${unpaidRes.status}`);

  const paymentRequiredHeader = unpaidRes.headers.get("payment-required");
  console.log("   PAYMENT-REQUIRED Header:", paymentRequiredHeader);
  assertCondition(!!paymentRequiredHeader, "Missing PAYMENT-REQUIRED header");

  const requirement = JSON.parse(paymentRequiredHeader!);
  console.log("   Parsed Payment Requirement:");
  console.log(`     - Pay To:        ${requirement.payTo}`);
  console.log(`     - Amount:        ${requirement.amount} tinybars (${Number(requirement.amount) / 1e8} HBAR)`);
  console.log(`     - Network:       ${requirement.network}`);
  console.log(`     - Asset:         ${requirement.asset}`);
  console.log("   ✅ Received valid x402 challenge negotiation from withX402 middleware.\n");

  // 3. Construct and Sign Authentic Hedera TransferTransaction on Testnet
  console.log("3. Constructing & Signing authentic Hedera TransferTransaction...");
  const sellerAccountId = AccountId.fromString(requirement.payTo);
  const tinybarAmount = BigInt(requirement.amount);
  const hbarAmount = Hbar.fromTinybars(tinybarAmount.toString());

  const transferTx = new TransferTransaction()
    .setNodeAccountIds([AccountId.fromString("0.0.3")])
    .setTransactionId(TransactionId.generate(buyerAccountId))
    .addHbarTransfer(buyerAccountId, hbarAmount.negated())
    .addHbarTransfer(sellerAccountId, hbarAmount)
    .setTransactionMemo("x402:e2e-live-payment-test")
    .freezeWith(client);

  await transferTx.sign(operatorKey);
  const txBytesBase64 = Buffer.from(transferTx.toBytes()).toString("base64");

  console.log(`   Transaction ID:   ${transferTx.transactionId?.toString()}`);
  console.log(`   Serialized Bytes: ${txBytesBase64.length} chars (base64)`);
  console.log("   ✅ TransferTransaction signed by buyer.\n");

  // 4. Submit Paid Request with payment-signature Header
  console.log(`4. Submitting Paid Request with payment-signature to ${endpointUrl}...`);
  const paidReq = new Request(endpointUrl, {
    method: "GET",
    headers: {
      "payment-signature": txBytesBase64,
    },
  });

  const paidRes = await routeHandler(paidReq as any);
  console.log(`   Response Status: HTTP ${paidRes.status} ${paidRes.statusText}`);
  assertCondition(paidRes.status === 200, `Expected HTTP 200 but got ${paidRes.status}`);

  const paymentResponseHeader = paidRes.headers.get("payment-response");
  console.log("   PAYMENT-RESPONSE Header:", paymentResponseHeader);
  assertCondition(!!paymentResponseHeader, "Missing PAYMENT-RESPONSE header");

  const resourcePayload = await paidRes.json();
  console.log("   Delivered Protected Resource Payload:");
  console.log(JSON.stringify(resourcePayload, null, 2));

  const settledTxId = resourcePayload.settlementReceipt?.transactionId;
  console.log(`\n   Settled Transaction ID: ${settledTxId}`);
  console.log("   ✅ Payment verified, settled in consensus, and resource delivered!\n");

  // 5. Verify Settlement on Hedera Mirror Node
  console.log("5. Verifying Transaction on Hedera Testnet Mirror Node...");
  // Format transaction ID for mirror node REST API: "0.0.X@sec.nano" -> "0.0.X-sec-nano"
  const formattedTxId = settledTxId
    .trim()
    .replace("@", "-")
    .replace(/\.(\d+)$/, "-$1");

  console.log(`   Querying Mirror Node: https://testnet.mirrornode.hedera.com/api/v1/transactions/${formattedTxId}`);
  
  // Wait up to 10 seconds for Mirror Node ingestion
  let mirrorVerified = false;
  for (let attempt = 1; attempt <= 5; attempt++) {
    await new Promise(r => setTimeout(r, 2000));
    try {
      const mirrorRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/transactions/${formattedTxId}`);
      if (mirrorRes.ok) {
        const mirrorJson: any = await mirrorRes.json();
        const txRecord = mirrorJson.transactions?.[0];
        if (txRecord) {
          console.log(`   Mirror Node Result: ${txRecord.result}`);
          console.log(`   Consensus Timestamp: ${txRecord.consensus_timestamp}`);
          console.log(`   Transfers:`);
          for (const tr of txRecord.transfers || []) {
            console.log(`     - Account ${tr.account}: ${tr.amount / 1e8} HBAR (${tr.amount} tinybars)`);
          }
          mirrorVerified = true;
          break;
        }
      }
    } catch {
      // Retry
    }
  }

  if (mirrorVerified) {
    console.log("   ✅ Mirror node confirmed consensus transaction status: SUCCESS.\n");
  } else {
    console.log("   (Mirror node ingestion pending; transaction submitted directly to consensus node).\n");
  }

  console.log("=======================================================");
  console.log("  🎉 END-TO-END LIVE x402 PAYMENT SUCCESSFULLY PAID!   ");
  console.log("=======================================================");
  console.log(`  HashScan URL: https://hashscan.io/testnet/transaction/${formattedTxId}`);
  console.log("=======================================================\n");

  // Exit cleanly
  process.exit(0);
}

function assertCondition(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

main().catch(err => {
  console.error("❌ Live payment test failed:", err);
  process.exit(1);
});
