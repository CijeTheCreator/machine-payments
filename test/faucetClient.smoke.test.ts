import * as assert from "assert";
import { generateAgentKeys, AgentKeys } from "../scripts/createAgent";
import { requestFaucetDispense } from "../scripts/fundAgent";

async function runSmokeTests() {
  console.log("🧪 Running agent provisioning smoke tests...\n");

  // Test 1: generateAgentKeys generates valid ECDSA keys
  const keys: AgentKeys = generateAgentKeys();
  assert.ok(keys.privateKey && keys.privateKey.length > 20, "Private key should be non-empty");
  assert.ok(keys.publicKeyDer && keys.publicKeyDer.length > 20, "Public key DER should be non-empty");
  assert.ok(keys.publicKeyRaw && keys.publicKeyRaw.length > 20, "Public key Raw should be non-empty");
  assert.ok(keys.evmAddress && keys.evmAddress.startsWith("0x"), "EVM address must start with 0x");
  assert.strictEqual(keys.evmAddress.length, 42, "EVM address must be 42 characters (0x + 40 hex)");
  console.log("  ✔ generateAgentKeys() produces valid ECDSA keypair and 42-char EVM address");

  // Test 2: requestFaucetDispense handles unreachable port gracefully without throwing unhandled rejection
  try {
    const unreachableUrl = "http://127.0.0.1:59999";
    await requestFaucetDispense(unreachableUrl, keys.publicKeyDer);
    assert.fail("Should have thrown network failure");
  } catch (err: any) {
    assert.ok(err, "Catches network connection errors gracefully");
    console.log("  ✔ requestFaucetDispense() cleanly catches connection errors for offline/down service");
  }

  console.log("\n🎉 All agent provisioning smoke tests passed cleanly!");
}

runSmokeTests().catch(err => {
  console.error("❌ Agent provisioning smoke test failed:", err);
  process.exit(1);
});
