import * as assert from "assert";
import * as fs from "fs";
import * as path from "path";
import * as os from "os";
import { generateLocalKeys, GeneratedKeys } from "../scripts/postinstallKeygen";
import { checkAccountBalance } from "../scripts/prepare";
import { parseArgs, renderRouteCode, generateRouteFile } from "../scripts/makeRoute";

async function runTests() {
  console.log("=================================================");
  console.log("  🧪 Running Prepare & Make-Route Unit Tests (Offline) ");
  console.log("=================================================\n");

  // Test 1: generateLocalKeys() generates valid ECDSA secp256k1 keypair offline
  console.log("Test 1: generateLocalKeys() offline ECDSA key generation...");
  const keys: GeneratedKeys = generateLocalKeys();
  assert.ok(keys.privateKey && keys.privateKey.length > 20, "Private key should be valid DER string");
  assert.ok(keys.publicKeyDer && keys.publicKeyDer.length > 20, "Public key DER should be non-empty");
  assert.ok(keys.publicKeyRaw && keys.publicKeyRaw.length > 20, "Public key Raw should be non-empty");
  assert.ok(keys.evmAddress && keys.evmAddress.startsWith("0x"), "EVM address must start with 0x");
  assert.strictEqual(keys.evmAddress.length, 42, "EVM address must be 42 characters");
  console.log("  ✔ Generated valid ECDSA keys and EVM alias offline");

  // Test 2: checkAccountBalance() handles unreachable endpoint gracefully
  console.log("\nTest 2: checkAccountBalance() offline / unreachable mirror node handling...");
  const balanceResult = await checkAccountBalance("0.0.12345", "testnet", "http://127.0.0.1:59998");
  assert.strictEqual(balanceResult.exists, false, "Should return exists: false when mirror node is offline");
  assert.strictEqual(balanceResult.balanceHbar, 0, "Should return balanceHbar: 0 when mirror node is offline");
  console.log("  ✔ Returns non-throwing fallback when mirror node is unreachable");

  // Test 3: parseArgs() flag parsing
  console.log("\nTest 3: parseArgs() CLI argument parsing...");
  const parsed1 = parseArgs(["--name", "sentiment", "--price", "0.5", "--trust", "--description", "Market sentiment analysis"]);
  assert.strictEqual(parsed1.name, "sentiment");
  assert.strictEqual(parsed1.priceHbar, 0.5);
  assert.strictEqual(parsed1.trust, true);
  assert.strictEqual(parsed1.noGuard, false);
  assert.strictEqual(parsed1.description, "Market sentiment analysis");

  const parsed2 = parseArgs(["--name=weather", "--price=2", "--no-guard", "--path=api/v1/weather", "-d", "Live weather feed"]);
  assert.strictEqual(parsed2.name, "weather");
  assert.strictEqual(parsed2.priceHbar, 2);
  assert.strictEqual(parsed2.noGuard, true);
  assert.strictEqual(parsed2.customPath, "api/v1/weather");
  assert.strictEqual(parsed2.description, "Live weather feed");
  console.log("  ✔ Parses all CLI flags and defaults accurately");

  // Test 4: renderRouteCode() generates correct TypeScript template with TODO and middlewares
  console.log("\nTest 4: renderRouteCode() code structure and middleware onion...");
  const codeDefault = renderRouteCode({
    endpointName: "sentiment",
    handlerName: "sentimentHandler",
    priceHbar: 1,
    priceTinybar: "100000000",
    includeGuard: true,
    includeTrust: false,
  });

  assert.ok(codeDefault.includes('import { withX402 } from "~~/services/facilitator";'), "Must import withX402");
  assert.ok(codeDefault.includes('import { withSpendGuard } from "~~/services/guard";'), "Must import withSpendGuard");
  assert.ok(!codeDefault.includes("withAgentTrust"), "Should not import withAgentTrust when trust=false");
  assert.ok(
    codeDefault.includes("// TODO: Implement the service or data you are selling here!"),
    "Must include developer TODO marker",
  );
  assert.ok(codeDefault.includes('const PRICE_TINYBAR = "100000000";'), "Must set price in tinybars");
  assert.ok(codeDefault.includes("export const GET = withX402("), "Must compose GET with x402 and spend guard");
  assert.ok(codeDefault.includes("export const POST = GET;"), "Must export POST = GET");
  console.log("  ✔ Generated code contains correct middleware onion, tinybars, and TODO section");

  // Test 5: renderRouteCode() withAgentTrust inclusion
  console.log("\nTest 5: renderRouteCode() with --trust enabled...");
  const codeTrust = renderRouteCode({
    endpointName: "compute",
    handlerName: "computeHandler",
    priceHbar: 2.5,
    priceTinybar: "250000000",
    includeGuard: true,
    includeTrust: true,
  });
  assert.ok(codeTrust.includes('import { withAgentTrust } from "~~/services/trust";'), "Must import withAgentTrust");
  assert.ok(codeTrust.includes("export const GET = withAgentTrust("), "Must wrap outer layer with withAgentTrust");
  assert.ok(codeTrust.includes('const PRICE_TINYBAR = "250000000";'), "Must convert 2.5 HBAR to 250,000,000 tinybars");
  console.log("  ✔ Correctly wraps withAgentTrust at top of pipeline");

  // Test 6: generateRouteFile() writes to disk cleanly and prevents accidental overwrite
  console.log("\nTest 6: generateRouteFile() file system creation & overwrite prevention...");
  const tempProjectDir = fs.mkdtempSync(path.join(os.tmpdir(), "scaffold-hbar-test-"));
  try {
    const res = generateRouteFile(
      {
        name: "test-service",
        priceHbar: 0.1,
      },
      tempProjectDir,
    );

    assert.ok(fs.existsSync(res.filePath), "Generated route file must exist on disk");
    assert.strictEqual(res.priceTinybar, "10000000", "0.1 HBAR must be 10,000,000 tinybars");
    assert.strictEqual(res.routeUrl, "/api/test-service", "Route URL must match relative path");
    assert.strictEqual(res.description, "test-service service", "Default description should match service name");

    const manifestFile = path.resolve(tempProjectDir, "packages/nextjs/app/routes-manifest.json");
    assert.ok(fs.existsSync(manifestFile), "routes-manifest.json should be created/updated");
    const manifestJson = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    assert.strictEqual(manifestJson.length, 1);
    assert.strictEqual(manifestJson[0].name, "test-service");
    assert.strictEqual(manifestJson[0].description, "test-service service");

    const content = fs.readFileSync(res.filePath, "utf-8");
    assert.ok(content.includes("testServiceHandler"), "Handler name should be camelCased");

    // Overwrite without --force should throw
    assert.throws(
      () => {
        generateRouteFile({ name: "test-service" }, tempProjectDir);
      },
      /Route file already exists/,
      "Should prevent overwriting without --force",
    );

    // Overwrite with --force should succeed
    const forcedRes = generateRouteFile(
      { name: "test-service", force: true, priceHbar: 5, description: "Updated test service" },
      tempProjectDir,
    );
    assert.strictEqual(forcedRes.priceTinybar, "500000000");
    assert.strictEqual(forcedRes.description, "Updated test service");

    const updatedManifest = JSON.parse(fs.readFileSync(manifestFile, "utf-8"));
    assert.strictEqual(updatedManifest.length, 1);
    assert.strictEqual(updatedManifest[0].description, "Updated test service");
    console.log("  ✔ Successfully created route file, updated routes-manifest.json, and enforced overwrite protection");
  } finally {
    fs.rmSync(tempProjectDir, { recursive: true, force: true });
  }

  console.log("\n" + "=".repeat(60));
  console.log("  🎉 All Prepare & Make-Route Tests Passed Cleanly (Offline) ");
  console.log("=".repeat(60) + "\n");
}

runTests().catch(err => {
  console.error("❌ Test failed:", err);
  process.exit(1);
});
