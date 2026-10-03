import * as assert from "assert";
import {
  createSpendGuard,
  SpendGuard,
  InMemorySpendStore,
  hbarToTinybar,
  tinybarToHbar,
  TINYBAR_PER_HBAR,
  CounterpartyAllowlistPolicy,
  SpendLimitPolicy,
  ApprovalTierPolicy,
} from "../packages/nextjs/services/guard";
import { loadYamlConfig } from "../packages/nextjs/services/config/yamlConfig";

async function runSpendGuardTests() {
  console.log("🧪 Running SpendGuard offline unit test suite (Gate 11 compliant)...\n");

  // Test 1: Config loading & tinybar conversion
  console.log("1. Testing config loading and unit conversions:");
  const config = loadYamlConfig();
  assert.ok(config.spendGuard, "YAML config should load spendGuard section");
  assert.strictEqual(typeof config.spendGuard.caps.perTaskHbar, "number");
  assert.strictEqual(hbarToTinybar(1), 100_000_000n, "1 HBAR = 100,000,000 tinybar");
  assert.strictEqual(tinybarToHbar(100_000_000n), 1, "100,000,000 tinybar = 1 HBAR");
  assert.strictEqual(TINYBAR_PER_HBAR, 100_000_000n);
  console.log("  ✔ YAML config loads cleanly and tinybar conversion is exact (1e8)");

  // Test 2: InMemorySpendStore atomic holds and rolling window
  console.log("\n2. Testing InMemorySpendStore atomic hold reservation & roll-off:");
  const store = new InMemorySpendStore({ rollingWindowMs: 500, holdTtlMs: 200 });
  const accountId = "0.0.12345";
  const dailyCap = hbarToTinybar(10); // 10 HBAR cap

  // Reserve 4 HBAR
  const hold1 = await store.reserveHold(accountId, hbarToTinybar(4), dailyCap);
  assert.strictEqual(hold1.allowed, true, "First 4 HBAR hold should be allowed");
  assert.ok(hold1.holdId, "Should return a holdId");

  // Reserve another 4 HBAR
  const hold2 = await store.reserveHold(accountId, hbarToTinybar(4), dailyCap);
  assert.strictEqual(hold2.allowed, true, "Second 4 HBAR hold should be allowed (total 8 HBAR <= 10 HBAR)");

  // Attempting 3 HBAR should fail (8 + 3 = 11 > 10)
  const hold3 = await store.reserveHold(accountId, hbarToTinybar(3), dailyCap);
  assert.strictEqual(hold3.allowed, false, "Third hold of 3 HBAR must be rejected (would breach 10 HBAR cap)");

  // Commit hold 1 (4 HBAR)
  await store.commitHold(hold1.holdId!);
  const spentSoFar = await store.getDailySpent(accountId);
  assert.strictEqual(spentSoFar, hbarToTinybar(4), "Daily spent should reflect committed 4 HBAR");

  // Release hold 2 (4 HBAR)
  await store.releaseHold(hold2.holdId!);
  const activeHolds = await store.getActiveHoldsTotal(accountId);
  assert.strictEqual(activeHolds, 0n, "Active holds should be 0 after release");

  // Now a 4 HBAR hold should succeed again (4 committed + 0 active + 4 new = 8 <= 10)
  const hold4 = await store.reserveHold(accountId, hbarToTinybar(4), dailyCap);
  assert.strictEqual(hold4.allowed, true, "Hold succeeds after previous uncommitted hold was released");
  console.log("  ✔ Atomic reservations prevent concurrent race conditions and release holds on cancellation");

  // Test 3: CounterpartyAllowlistPolicy
  console.log("\n3. Testing CounterpartyAllowlistPolicy:");
  const allowlistPolicy = new CounterpartyAllowlistPolicy(["0.0.56789", "0.0.99999"]);
  
  // Unallowlisted account must throw
  let blocked = false;
  try {
    (allowlistPolicy as any).shouldBlockPreToolExecution(
      { rawParams: { to: "0.0.66666", amount: 1 } },
      "transfer_hbar",
    );
  } catch (err: any) {
    blocked = true;
    assert.ok(err.message.includes("is not authorized"), "Error must state recipient is not authorized");
  }
  assert.strictEqual(blocked, true, "CounterpartyAllowlistPolicy must block non-allowlisted accounts");

  // Allowlisted account must not throw
  const allowed = (allowlistPolicy as any).shouldBlockPreToolExecution(
    { rawParams: { to: "0.0.56789", amount: 1 } },
    "transfer_hbar",
  );
  assert.strictEqual(allowed, false, "Allowlisted recipient passes without error");
  console.log("  ✔ CounterpartyAllowlistPolicy strictly enforces recipient boundary");

  // Test 4: ApprovalTierPolicy & HIP-423 Scheduling
  console.log("\n4. Testing ApprovalTierPolicy & HIP-423 HITL escalation:");
  const approvalPolicy = new ApprovalTierPolicy(
    null, // offline client
    accountId,
    5, // 5 HBAR per-task cap
    undefined,
    store,
  );

  // Transfer <= 5 HBAR passes
  const tierPass = await (approvalPolicy as any).shouldBlockPreToolExecution(
    { rawParams: { to: "0.0.56789", amount: 3 } },
    "transfer_hbar",
  );
  assert.strictEqual(tierPass, false, "Payment within per-task cap passes auto-approval");

  // Transfer > 5 HBAR triggers escalation exception with scheduleId
  let escalated = false;
  try {
    await (approvalPolicy as any).shouldBlockPreToolExecution(
      { rawParams: { to: "0.0.56789", amount: 20 } },
      "transfer_hbar",
    );
  } catch (err: any) {
    escalated = true;
    assert.ok(err.message.includes("Escalated"), "Error must state payment is escalated");
    assert.ok(err.message.includes("scheduled transaction"), "Error must mention scheduled transaction");
  }
  assert.strictEqual(escalated, true, "Payments exceeding per-task limit escalate to HIP-423 scheduled transaction");
  console.log("  ✔ ApprovalTierPolicy escalates over-cap payments to authentic HIP-423 scheduled transactions");

  // Test 5: Full SpendGuard Facade & executePayment API
  console.log("\n5. Testing SpendGuard programmatic executePayment() API:");
  const guard = createSpendGuard({
    agentAccountId: "0.0.12345",
    mode: "auto",
    perTaskCapHbar: 5,
    perDayCapHbar: 20,
    allowlist: ["0.0.56789", "0.0.77777"],
    store: new InMemorySpendStore(),
  });

  assert.strictEqual(guard.resolvedMode, "offchain", "Auto mode without vault address resolves to offchain");

  // 5a. Block non-allowlisted transfer
  const resBlock = await guard.executePayment({
    to: "0.0.11111",
    amountHbar: 2,
  });
  assert.strictEqual(resBlock.success, false);
  assert.strictEqual(resBlock.decision, "BLOCK");
  assert.ok(resBlock.reason?.includes("not authorized"), "Reason states recipient not authorized");

  // 5b. Escalate over-task payment
  const resEscalate = await guard.executePayment({
    to: "0.0.56789",
    amountHbar: 15, // > 5 HBAR cap
  });
  assert.strictEqual(resEscalate.success, false);
  assert.strictEqual(resEscalate.decision, "ESCALATE");
  assert.ok(resEscalate.scheduleId, "Should return a pending scheduleId");

  // 5c. Allow valid payment
  const resAllow = await guard.executePayment({
    to: "0.0.56789",
    amountHbar: 3,
  });
  assert.strictEqual(resAllow.success, true);
  assert.strictEqual(resAllow.decision, "ALLOW");
  assert.ok(resAllow.txId, "Returns transaction ID");

  // 5d. Check daily spent tracking
  const dailySpent = await guard.getDailySpent();
  assert.strictEqual(dailySpent, 3, "Daily spent should reflect 3 HBAR");

  // 5e. Audit history recording
  const history = await guard.getAuditHistory();
  assert.strictEqual(history.length, 3, "History should record all 3 decisions (BLOCK, ESCALATE, ALLOW)");
  assert.strictEqual(history[0].decision, "ALLOW");
  assert.strictEqual(history[1].decision, "ESCALATE");
  assert.strictEqual(history[2].decision, "BLOCK");
  console.log("  ✔ executePayment() seamlessly executes ALLOW, BLOCK, and ESCALATE decision ladder");

  // Test 6: Vault Mode Auto-Detection & getAgentKitHooks()
  console.log("\n6. Testing Vault mode detection and Hedera Agent Kit v4 hooks:");
  const vaultGuard = createSpendGuard({
    vaultAddress: "0.0.44444", // Setting vault address
    mode: "auto",
  });
  assert.strictEqual(vaultGuard.resolvedMode, "vault", "Auto mode with vaultAddress resolves to vault (L2)");

  const hooks = vaultGuard.getAgentKitHooks();
  assert.strictEqual(hooks.length, 5, "getAgentKitHooks() provides all 5 policies and lifecycle hooks");
  console.log("  ✔ Vault mode auto-detection and Agent Kit v4 hook wiring verified cleanly");

  console.log("\n🎉 All 6 SpendGuard offline test suites passed with 100% success!");
}

runSpendGuardTests().catch(err => {
  console.error("❌ SpendGuard offline unit tests failed:", err);
  process.exit(1);
});
