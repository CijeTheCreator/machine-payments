import assert from "assert";
import {
  encodeHcs2Metadata,
  decodeHcs2Metadata,
  formatHcs2Message,
  publishPolicyVersion,
  PolicySnapshot,
} from "../packages/nextjs/services/guard/policyRegistry";

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 Running HCS-2 Policy Registry Unit Tests   ");
  console.log("=================================================\n");

  // Test 1: RFC 2397 Data URI Encoding
  console.log("Test 1: encodeHcs2Metadata should return RFC 2397 data URI...");
  const samplePayload = {
    currency: "HBAR",
    perTaskHbar: 5,
    perDayHbar: 50,
    allowlist: ["0.0.56789"],
  };
  const dataUri = encodeHcs2Metadata(samplePayload);
  assert(dataUri.startsWith("data:application/json;base64,"), "Must start with data:application/json;base64,");
  const rawBase64 = dataUri.replace("data:application/json;base64,", "");
  const decodedJson = JSON.parse(Buffer.from(rawBase64, "base64").toString("utf-8"));
  assert.strictEqual(decodedJson.currency, "HBAR");
  assert.strictEqual(decodedJson.perTaskHbar, 5);
  console.log("  ✅ Passed: Base64 data URI formatting verified.\n");

  // Test 2: decodeHcs2Metadata with data URI prefix
  console.log("Test 2: decodeHcs2Metadata with data URI prefix...");
  const decodedObj = decodeHcs2Metadata<typeof samplePayload>(dataUri);
  assert.strictEqual(decodedObj.currency, "HBAR");
  assert.strictEqual(decodedObj.perTaskHbar, 5);
  assert.strictEqual(decodedObj.perDayHbar, 50);
  assert.deepStrictEqual(decodedObj.allowlist, ["0.0.56789"]);
  console.log("  ✅ Passed: Prefixed data URI decoding verified.\n");

  // Test 3: decodeHcs2Metadata with raw base64 string
  console.log("Test 3: decodeHcs2Metadata with raw base64 string...");
  const rawB64 = Buffer.from(JSON.stringify({ test: "value", num: 42 })).toString("base64");
  const decodedRaw = decodeHcs2Metadata<{ test: string; num: number }>(rawB64);
  assert.strictEqual(decodedRaw.test, "value");
  assert.strictEqual(decodedRaw.num, 42);
  console.log("  ✅ Passed: Raw base64 string decoding verified.\n");

  // Test 4: formatHcs2Message structure compliance
  console.log("Test 4: formatHcs2Message compliance with HCS-2 standard...");
  const policy: PolicySnapshot = {
    currency: "HBAR",
    perTaskHbar: 10,
    perDayHbar: 100,
    autoApprovalLimitHbar: 5,
    allowlist: ["0.0.1111", "0.0.2222"],
    blockedTools: ["delete_account"],
    mode: "vault",
  };

  const message = formatHcs2Message({
    policy,
    reason: "Increase daily cap for production run",
    auditTopicId: "0.0.99999",
    timestamp: 1710000000000,
  });

  assert.strictEqual(message.p, "hcs-2", "Protocol identifier must be 'hcs-2'");
  assert.strictEqual(message.op, "register", "Action operation must be 'register'");
  assert.strictEqual(message.t_id, "0.0.99999", "Target audit topic must match");
  assert.strictEqual(message.m, "Increase daily cap for production run", "Memo must match reason");
  assert(message.metadata.startsWith("data:application/json;base64,"), "Metadata must be base64 data URI");

  const unpacked = decodeHcs2Metadata<any>(message.metadata);
  assert.strictEqual(unpacked.perTaskHbar, 10);
  assert.strictEqual(unpacked.perDayHbar, 100);
  assert.strictEqual(unpacked.mode, "vault");
  assert.strictEqual(unpacked.ts, 1710000000000);
  console.log("  ✅ Passed: HCS-2 register message format verified.\n");

  // Test 5: publishPolicyVersion offline / unconfigured safety
  console.log("Test 5: publishPolicyVersion offline graceful handling...");
  const offlineResult = await publishPolicyVersion(null, policy, undefined, {
    reason: "Offline test",
    auditTopicId: "0.0.123",
  });
  assert.strictEqual(offlineResult.success, true, "Must return success true without network");
  assert(offlineResult.message, "Must construct valid message even when offline");
  assert.strictEqual(offlineResult.message.p, "hcs-2");
  console.log("  ✅ Passed: Offline execution safe and non-blocking.\n");

  // Test 6: Error handling on invalid metadata
  console.log("Test 6: decodeHcs2Metadata invalid input handling...");
  assert.throws(
    () => {
      decodeHcs2Metadata("");
    },
    /Invalid HCS-2 metadata string/,
    "Must throw on empty string",
  );
  console.log("  ✅ Passed: Malformed input properly rejected.\n");

  console.log("=================================================");
  console.log("  🎉 All 6 Policy Registry unit tests passed!    ");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("❌ Policy registry test failure:", err);
  process.exit(1);
});
