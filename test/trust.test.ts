import assert from "assert";
import {
  generateAgentDID,
  getAddressFromDID,
  buildAuthChallenge,
  signAuthChallenge,
  verifyAuthChallenge,
  agentRegistry,
  withAgentTrust,
  agentTrustPlugin,
  RegisterAgentTool,
  ValidateAgentTool,
  VerifyAgentSignatureTool,
} from "../packages/nextjs/services/trust";
import { TrustedAgentPolicy } from "../packages/nextjs/services/guard";

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 Running Agent Trust & Identity Offline Tests ");
  console.log("=================================================\n");

  // Sample test private key and derived address
  const testPrivateKey = "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";
  const expectedAddress = "0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";

  // Test 1: DID Generation & Address Extraction
  console.log("Test 1: DID Generation & Parsing...");
  const did = generateAgentDID(expectedAddress, "testnet");
  assert.strictEqual(did, `did:hedera:testnet:${expectedAddress}`);

  const parsedAddress = getAddressFromDID(did);
  assert.strictEqual(parsedAddress, expectedAddress);

  // Cross-compatibility with iden3 DID
  const iden3Did = "did:iden3:polygon:amoy:0xf39fd6e51aad88f6f4ce6ab8827279cfffb92266";
  assert.strictEqual(getAddressFromDID(iden3Did), expectedAddress);
  console.log("  ✅ Passed: DIDs generated and parsed correctly across formats.\n");

  // Test 2: Cryptographic Challenge Signing & Verification
  console.log("Test 2: Cryptographic Challenge & Signature Proof...");
  const now = Date.now();
  const signature = await signAuthChallenge(testPrivateKey, did, now);
  assert(signature.startsWith("0x"), "Signature must be 0x hex string");

  const verification = await verifyAuthChallenge(did, now, signature);
  assert.strictEqual(verification.valid, true);
  assert.strictEqual(verification.address, expectedAddress);

  // Expired / drifted timestamp
  const expiredTime = now - 600_000; // 10 mins ago (max drift 5 mins)
  const expiredSig = await signAuthChallenge(testPrivateKey, did, expiredTime);
  const expiredVerification = await verifyAuthChallenge(did, expiredTime, expiredSig);
  assert.strictEqual(expiredVerification.valid, false);
  assert(expiredVerification.error?.includes("drift"), "Should detect timestamp drift");

  // Bad signature
  const fakeSig = "0x" + "00".repeat(65);
  const badVerification = await verifyAuthChallenge(did, now, fakeSig);
  assert.strictEqual(badVerification.valid, false);
  console.log("  ✅ Passed: Challenge signing, address recovery, and replay prevention verified.\n");

  // Test 3: Agent Registry Service Operations
  console.log("Test 3: Agent Registry Service Lifecycle...");
  agentRegistry.clear();

  assert.strictEqual(await agentRegistry.isAgentRegistered(expectedAddress), false);

  const registered = await agentRegistry.registerAgent({
    did,
    description: "Machine Payment Worker Agent",
    serviceEndpoint: "https://agent.example.com/api/tasks",
    walletAddress: expectedAddress,
  });

  assert.strictEqual(registered.did, did);
  assert.strictEqual(registered.agentId, 1);
  assert.strictEqual(registered.walletAddress, expectedAddress);
  assert.strictEqual(registered.active, true);

  assert.strictEqual(await agentRegistry.isAgentRegistered(expectedAddress), true);
  assert.strictEqual(await agentRegistry.isAgentRegistered(did), true);

  const retrieved = await agentRegistry.getAgent(did);
  assert.strictEqual(retrieved?.description, "Machine Payment Worker Agent");

  // Update endpoint
  await agentRegistry.updateServiceEndpoint(expectedAddress, "https://agent.example.com/api/v2");
  const updated = await agentRegistry.getAgent(expectedAddress);
  assert.strictEqual(updated?.serviceEndpoint, "https://agent.example.com/api/v2");

  // Deactivate
  await agentRegistry.deactivateAgent(expectedAddress);
  assert.strictEqual(await agentRegistry.isAgentRegistered(expectedAddress), false);
  console.log("  ✅ Passed: Full registry lifecycle (register, lookup, update, deactivate) verified.\n");

  // Test 4: Composable withAgentTrust Route Handler Middleware
  console.log("Test 4: withAgentTrust Next.js Middleware...");
  agentRegistry.clear();
  await agentRegistry.registerAgent({
    did,
    description: "Verified Service Agent",
    serviceEndpoint: "https://service.agent.io",
    walletAddress: expectedAddress,
  });

  const testHandler = withAgentTrust(async (_req, { agent }) => {
    return new Response(JSON.stringify({ success: true, agentId: agent?.agentId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  });

  // Missing headers
  const reqNoHeaders = new Request("http://localhost/api/test", { method: "POST" });
  const resNoHeaders = await testHandler(reqNoHeaders);
  assert.strictEqual(resNoHeaders.status, 401);

  // Valid authenticated request
  const validTimestamp = Date.now();
  const validSig = await signAuthChallenge(testPrivateKey, did, validTimestamp);

  const reqValid = new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "x-agent-did": did,
      "x-agent-signature": validSig,
      "x-agent-timestamp": validTimestamp.toString(),
    },
  });
  const resValid = await testHandler(reqValid);
  assert.strictEqual(resValid.status, 200);
  const validBody = await resValid.json();
  assert.strictEqual(validBody.success, true);
  assert.strictEqual(validBody.agentId, 1);

  // Unregistered agent request
  const unregisteredKey = "0x59c6995e998f97a5a0044966f0945389dc9e86dae88c7a8412f4603b6b78690d";
  const unregisteredAddress = "0x70997970c51812dc3a010c7d01b50e0d17dc79c8";
  const unregisteredDid = generateAgentDID(unregisteredAddress);
  const unregSig = await signAuthChallenge(unregisteredKey, unregisteredDid, validTimestamp);

  const reqUnreg = new Request("http://localhost/api/test", {
    method: "POST",
    headers: {
      "x-agent-did": unregisteredDid,
      "x-agent-signature": unregSig,
      "x-agent-timestamp": validTimestamp.toString(),
    },
  });
  const resUnreg = await testHandler(reqUnreg);
  assert.strictEqual(resUnreg.status, 403);
  console.log("  ✅ Passed: Middleware correctly authenticates registered agents & rejects impostors.\n");

  // Test 5: Hedera Agent Kit v4 Plugin & BaseTool Execution
  console.log("Test 5: Hedera Agent Kit v4 Plugin & Tools...");
  assert.strictEqual(agentTrustPlugin.name, "agent-trust-plugin");
  const tools = agentTrustPlugin.tools();
  assert.strictEqual(tools.length, 3);

  const registerTool = new RegisterAgentTool();
  const validateTool = new ValidateAgentTool();
  const verifyTool = new VerifyAgentSignatureTool();

  // Test tool methods & schemas
  assert.strictEqual(registerTool.method, "register_agent_tool");
  assert.strictEqual(validateTool.method, "validate_agent_tool");
  assert.strictEqual(verifyTool.method, "verify_agent_signature_tool");

  // Execute Register Tool
  const newAgentAddress = "0x3c44cdddb6a900fa2b585dd299e03d12fa4293bc";
  const newAgentDid = generateAgentDID(newAgentAddress);
  const regResult = await registerTool.execute({} as any, {} as any, {
    did: newAgentDid,
    description: "Data Provider Agent",
    serviceEndpoint: "https://data.agent.io",
    walletAddress: newAgentAddress,
  });
  assert.strictEqual(regResult.raw.status, "SUCCESS");

  // Execute Validate Tool
  const valResult = await validateTool.execute({} as any, {} as any, {
    target: newAgentDid,
  });
  assert.strictEqual(valResult.raw.status, "SUCCESS");
  assert.strictEqual(valResult.raw.exists, true);

  // Execute Verify Signature Tool
  const verifyResult = await verifyTool.execute({} as any, {} as any, {
    did,
    timestamp: validTimestamp,
    signature: validSig,
  });
  assert.strictEqual(verifyResult.raw.status, "SUCCESS");
  assert.strictEqual(verifyResult.raw.valid, true);
  console.log("  ✅ Passed: HAK v4 plugin tools (Register, Validate, Verify) execute cleanly.\n");

  // Test 6: Spend Guard TrustedAgentPolicy
  console.log("Test 6: Spend Guard TrustedAgentPolicy...");
  const trustedPolicy = new TrustedAgentPolicy({
    strict: true,
    exemptRecipients: ["0.0.123456"], // e.g. treasury
  });

  // Transfer to registered agent should pass
  let policyBlocked = false;
  try {
    await (trustedPolicy as any).shouldBlockPreToolExecution(
      { rawParams: { recipient: expectedAddress, amount: 2 } },
      "transfer_hbar",
    );
  } catch {
    policyBlocked = true;
  }
  assert.strictEqual(policyBlocked, false, "Registered agent transfer should be allowed");

  // Transfer to exempt recipient should pass
  policyBlocked = false;
  try {
    await (trustedPolicy as any).shouldBlockPreToolExecution(
      { rawParams: { recipient: "0.0.123456", amount: 5 } },
      "transfer_hbar",
    );
  } catch {
    policyBlocked = true;
  }
  assert.strictEqual(policyBlocked, false, "Exempt recipient transfer should be allowed");

  // Transfer to unregistered agent should be blocked
  policyBlocked = false;
  try {
    await (trustedPolicy as any).shouldBlockPreToolExecution(
      { rawParams: { recipient: "0x1111111111111111111111111111111111111111", amount: 1 } },
      "transfer_hbar",
    );
  } catch (err: any) {
    policyBlocked = true;
    assert(err.message.includes("TrustedAgentPolicy"));
  }
  assert.strictEqual(policyBlocked, true, "Unregistered agent transfer must be blocked");
  console.log("  ✅ Passed: TrustedAgentPolicy blocks unverified recipients in spend pipeline.\n");

  console.log("=================================================");
  console.log("  🎉 All Agent Trust Offline Tests Passed!       ");
  console.log("=================================================\n");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
