import assert from "assert";
import { withX402 } from "../packages/nextjs/services/facilitator";
import { withSpendGuard } from "../packages/nextjs/services/guard";
import { withAgentTrust, signAuthChallenge } from "../packages/nextjs/services/trust";
import { agentRegistry } from "../packages/nextjs/services/trust/registry";
import { AccountId, Hbar, PrivateKey, TransactionId, TransferTransaction } from "@hiero-ledger/sdk";
import { ethers } from "ethers";

// Generate mock signed TransferTransaction bytes
function generateValidTransferTx(payerAccountId = "0.0.11111", amountTinybar = 100000000, recipient = "0.0.56789") {
  const buyerId = AccountId.fromString(payerAccountId);
  const sellerId = AccountId.fromString(recipient);
  const amountHbar = Hbar.fromTinybars(amountTinybar);

  const tx = new TransferTransaction()
    .setNodeAccountIds([AccountId.fromString("0.0.3")])
    .setTransactionId(TransactionId.generate(buyerId))
    .addHbarTransfer(buyerId, amountHbar.negated())
    .addHbarTransfer(sellerId, amountHbar);

  return Buffer.from(tx.toBytes()).toString("base64");
}

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 Running Route Middleware Offline Unit Tests  ");
  console.log("=================================================\n");

  const sellerAccount = "0.0.56789";
  const demandedAmount = "100000000"; // 1 HBAR

  // ---------------------------------------------------------------------------
  // Test 1: withX402 generates 402 challenge when unpaid
  // ---------------------------------------------------------------------------
  console.log("Test 1: withX402 challenge on unpaid request...");
  const sampleHandler = async (_req: Request, context: any) => {
    return Response.json({ success: true, payment: context.payment });
  };

  const x402ProtectedHandler = withX402(sampleHandler, {
    priceTinybar: demandedAmount,
    payTo: sellerAccount,
    memo: "test-resource-access",
  });

  const unpaidReq = new Request("https://example.com/api/test");
  const res1 = await x402ProtectedHandler(unpaidReq);

  assert.strictEqual(res1.status, 402, "Should return HTTP 402");
  assert(res1.headers.has("payment-required"), "Must have PAYMENT-REQUIRED header");
  assert(res1.headers.has("www-authenticate"), "Must have WWW-Authenticate header");

  const body1 = await res1.json();
  assert.strictEqual(body1.error, "Payment Required");
  assert.strictEqual(body1.requirement.amount, demandedAmount);
  assert.strictEqual(body1.requirement.payTo, sellerAccount);
  console.log("  ✅ Passed: withX402 correctly issues 402 challenge with compliant headers.\n");

  // ---------------------------------------------------------------------------
  // Test 2: withX402 settles valid payment-signature header and enriches context
  // ---------------------------------------------------------------------------
  console.log("Test 2: withX402 verifies, settles, and enriches context for valid payment header...");
  const validTxBytes = generateValidTransferTx("0.0.11111", 100000000, sellerAccount);

  let capturedContext: any = null;
  const capturingHandler = async (_req: Request, context: any) => {
    capturedContext = context;
    return Response.json({ data: "secret-insights" });
  };

  const paymentHandler = withX402(capturingHandler, {
    priceTinybar: demandedAmount,
    payTo: sellerAccount,
  });

  const paidReq = new Request("https://example.com/api/test", {
    headers: {
      "payment-signature": validTxBytes,
    },
  });

  const res2 = await paymentHandler(paidReq);
  assert.strictEqual(res2.status, 200, "Should return HTTP 200");
  assert(res2.headers.has("payment-response"), "Must set PAYMENT-RESPONSE header");
  const paymentResponseHeader = JSON.parse(res2.headers.get("payment-response")!);
  assert.strictEqual(paymentResponseHeader.settled, true);

  assert(capturedContext?.payment, "Context must contain payment info");
  assert.strictEqual(capturedContext.payment.payer, "0.0.11111");
  assert.strictEqual(capturedContext.payment.amountTinybar, demandedAmount);
  assert.strictEqual(capturedContext.payment.amountHbar, 1);
  console.log("  ✅ Passed: withX402 verified and settled payment, attached PAYMENT-RESPONSE, and enriched context.\n");

  // ---------------------------------------------------------------------------
  // Test 3: withX402 rejects underpaid transaction
  // ---------------------------------------------------------------------------
  console.log("Test 3: withX402 rejects underpaid transaction...");
  const underpaidTxBytes = generateValidTransferTx("0.0.11111", 50000000, sellerAccount); // 0.5 HBAR
  const underpaidReq = new Request("https://example.com/api/test", {
    headers: {
      "payment-signature": underpaidTxBytes,
    },
  });

  const res3 = await paymentHandler(underpaidReq);
  assert.strictEqual(res3.status, 402, "Should reject underpaid transaction with 402");
  const body3 = await res3.json();
  assert.strictEqual(body3.error, "Invalid Payment Signature");
  console.log("  ✅ Passed: withX402 correctly rejected underpaid transaction.\n");

  // ---------------------------------------------------------------------------
  // Test 4: withSpendGuard context injection and maxPriceHbar limit
  // ---------------------------------------------------------------------------
  console.log("Test 4: withSpendGuard context injection and maxPriceHbar limit...");
  let guardContext: any = null;
  const guardedHandler = withSpendGuard(
    async (_req: Request, context: any) => {
      guardContext = context;
      return Response.json({ success: true });
    },
    { maxPriceHbar: 0.5, recordAudit: false },
  );

  // Invoke with mock context simulating a payment of 1 HBAR (exceeds 0.5 cap)
  const req4 = new Request("https://example.com/api/test");
  const res4Exceed = await guardedHandler(req4, {
    payment: {
      payer: "0.0.11111",
      amountHbar: 1.0,
      amountTinybar: "100000000",
      transactionId: "0.0.11111@12345.67890",
    },
  });

  assert.strictEqual(res4Exceed.status, 400, "Should return HTTP 400 for exceeding cap");
  const body4Exceed = await res4Exceed.json();
  assert.strictEqual(body4Exceed.error, "PaymentExceedsCap");

  // Invoke with payment within cap
  const res4Allow = await guardedHandler(req4, {
    payment: {
      payer: "0.0.11111",
      amountHbar: 0.2,
      amountTinybar: "20000000",
      transactionId: "0.0.11111@12345.67890",
    },
  });

  assert.strictEqual(res4Allow.status, 200, "Should pass when within cap");
  assert(guardContext?.guard, "Must inject context.guard");
  console.log("  ✅ Passed: withSpendGuard enforced maxPriceHbar and injected context.guard.\n");

  // ---------------------------------------------------------------------------
  // Test 5: withSpendGuard allowlist enforcement
  // ---------------------------------------------------------------------------
  console.log("Test 5: withSpendGuard counterparty allowlist enforcement...");
  const allowlistGuardedHandler = withSpendGuard(
    async (_req: Request, context: any) => {
      return Response.json({ success: true, payer: context.payment.payer });
    },
    { allowlist: ["0.0.99999"], recordAudit: false },
  );

  const blockedRes = await allowlistGuardedHandler(new Request("https://example.com/api/test"), {
    payment: {
      payer: "0.0.11111",
      amountHbar: 0.1,
      amountTinybar: "10000000",
    },
  });

  assert.strictEqual(blockedRes.status, 403, "Should return HTTP 403 for unauthorized payer");
  const blockedBody = await blockedRes.json();
  assert.strictEqual(blockedBody.error, "UnauthorizedPayer");
  console.log("  ✅ Passed: withSpendGuard rejected non-allowlisted payer with HTTP 403.\n");

  // ---------------------------------------------------------------------------
  // Test 6: Full Middleware Composition (withAgentTrust + withX402 + withSpendGuard)
  // ---------------------------------------------------------------------------
  console.log("Test 6: Full composed pipeline: withAgentTrust -> withX402 -> withSpendGuard...");
  const agentWallet = ethers.Wallet.createRandom();
  const agentAddress = agentWallet.address;
  const agentDid = `did:hedera:testnet:${agentAddress}`;

  // Mock registry for test
  (agentRegistry as any).getAgent = async (addr: string) => {
    if (addr.toLowerCase() === agentAddress.toLowerCase()) {
      return {
        did: agentDid,
        address: agentAddress,
        name: "Test Agent",
        description: "Registered Agent",
        registeredAt: Date.now(),
      };
    }
    return null;
  };

  let fullContext: any = null;
  const targetHandler = async (_req: Request, context: any) => {
    fullContext = context;
    return Response.json({
      status: "success",
      agentCaller: context.agent?.did,
      settlementReceipt: context.payment?.settlement,
    });
  };

  const composedPipeline = withAgentTrust(
    withX402(
      withSpendGuard(targetHandler, {
        maxPriceHbar: 5,
        recordAudit: false,
      }),
      {
        priceHbar: 1,
        payTo: sellerAccount,
      },
    ),
    { requireRegistered: true },
  );

  // A. Request without agent headers should fail at withAgentTrust
  const reqNoAuth = new Request("https://example.com/api/pipeline");
  const resNoAuth = await composedPipeline(reqNoAuth);
  assert.strictEqual(resNoAuth.status, 401, "Should fail agent auth with 401");
  const noAuthBody = await resNoAuth.json();
  assert.strictEqual(noAuthBody.error, "UnauthorizedAgent");
  console.log("  Step A: Pipeline cleanly blocked unauthenticated agent before payment check.");

  // B. Request with valid agent headers but no payment should fail at withX402 with 402
  const timestamp = Date.now();
  const signature = await signAuthChallenge(agentWallet.privateKey, agentDid, timestamp);

  const authHeaders = {
    "x-agent-did": agentDid,
    "x-agent-signature": signature,
    "x-agent-timestamp": timestamp.toString(),
  };

  const reqAuthNoPay = new Request("https://example.com/api/pipeline", {
    headers: authHeaders,
  });

  const resAuthNoPay = await composedPipeline(reqAuthNoPay);
  assert.strictEqual(resAuthNoPay.status, 402, "Should return 402 Payment Required");
  assert(resAuthNoPay.headers.has("payment-required"));
  console.log("  Step B: Pipeline authenticated agent identity and requested x402 payment.");

  // C. Request with valid agent headers AND valid payment signature succeeds
  const reqAuthAndPaid = new Request("https://example.com/api/pipeline", {
    headers: {
      ...authHeaders,
      "payment-signature": validTxBytes,
    },
  });

  const resAuthAndPaid = await composedPipeline(reqAuthAndPaid);
  assert.strictEqual(resAuthAndPaid.status, 200, "Should return 200 OK");
  assert(resAuthAndPaid.headers.has("payment-response"));

  assert(fullContext?.agent, "Context must have agent identity");
  assert.strictEqual(fullContext.agent.did, agentDid);
  assert(fullContext?.payment, "Context must have payment info");
  assert.strictEqual(fullContext.payment.payer, "0.0.11111");
  assert(fullContext?.guard, "Context must have guard instance");
  console.log("  Step C: Pipeline fully authorized agent, verified/settled payment, and passed to guarded handler.");
  console.log("  ✅ Passed: Composed middleware pipeline executed in exact sequence.\n");

  console.log("=================================================");
  console.log("  🎉 All Route Middleware Tests Passed (Offline) ");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("❌ Test suite failed:", err);
  process.exit(1);
});
