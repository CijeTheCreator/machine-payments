import * as fs from "fs";
import * as path from "path";
import { parse } from "envfile";

export interface MakeRouteOptions {
  name: string;
  priceHbar?: number;
  description?: string;
  customPath?: string;
  noGuard?: boolean;
  trust?: boolean;
  force?: boolean;
}

export function parseArgs(args: string[]): MakeRouteOptions & { help?: boolean } {
  let name = "";
  let priceHbar = 1;
  let description = "";
  let customPath = "";
  let noGuard = false;
  let trust = false;
  let force = false;
  let help = false;

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--name" || arg === "-n") {
      name = args[++i] || "";
    } else if (arg.startsWith("--name=")) {
      name = arg.split("=")[1] || "";
    } else if (arg === "--price" || arg === "-p") {
      const val = parseFloat(args[++i]);
      if (!isNaN(val)) priceHbar = val;
    } else if (arg.startsWith("--price=")) {
      const val = parseFloat(arg.split("=")[1]);
      if (!isNaN(val)) priceHbar = val;
    } else if (arg === "--description" || arg === "-d") {
      description = args[++i] || "";
    } else if (arg.startsWith("--description=")) {
      description = arg.split("=")[1] || "";
    } else if (arg === "--path") {
      customPath = args[++i] || "";
    } else if (arg.startsWith("--path=")) {
      customPath = arg.split("=")[1] || "";
    } else if (arg === "--no-guard") {
      noGuard = true;
    } else if (arg === "--trust") {
      trust = true;
    } else if (arg === "--force" || arg === "-f") {
      force = true;
    } else if (!name && !arg.startsWith("-")) {
      name = arg;
    }
  }

  return { name, priceHbar, description, customPath, noGuard, trust, force, help };
}

export function renderRouteCode(options: {
  endpointName: string;
  handlerName: string;
  priceHbar: number;
  priceTinybar: string;
  includeGuard: boolean;
  includeTrust: boolean;
}): string {
  const { endpointName, handlerName, priceHbar, priceTinybar, includeGuard, includeTrust } = options;

  const trustImport = includeTrust ? 'import { withAgentTrust } from "~~/services/trust";\n' : "";
  const guardImport = includeGuard ? 'import { withSpendGuard } from "~~/services/guard";\n' : "";

  const contextParams = [
    "payment",
    includeGuard ? "guard" : null,
    includeTrust ? "agent" : null,
  ]
    .filter(Boolean)
    .join(", ");

  const maxPriceHbar = Math.max(10, Math.ceil(priceHbar * 5));

  let pipeline = "";
  if (includeGuard) {
    pipeline = `withX402(
  withSpendGuard(${handlerName}, {
    maxPriceHbar: ${maxPriceHbar},
    recordAudit: true,
  }),
  {
    priceTinybar: PRICE_TINYBAR,
    payTo: PAY_TO,
    memo: "x402-${endpointName}",
  },
)`;
  } else {
    pipeline = `withX402(${handlerName}, {
  priceTinybar: PRICE_TINYBAR,
  payTo: PAY_TO,
  memo: "x402-${endpointName}",
})`;
  }

  if (includeTrust) {
    pipeline = `withAgentTrust(\n  ${pipeline.split("\n").join("\n  ")}\n)`;
  }

  return `import { NextResponse } from "next/server";
${trustImport}import { withX402 } from "~~/services/facilitator";
${guardImport}
// ${priceHbar} HBAR = ${priceTinybar} tinybars
const PRICE_TINYBAR = "${priceTinybar}";

// Payment destination: Routes to Vault if deployed, else seller account
const PAY_TO =
  process.env.NEXT_PUBLIC_VAULT_ADDRESS || process.env.VAULT_CONTRACT_ID || process.env.AGENT_ACCOUNT_ID || "0.0.X";

/**
 * x402 protected resource handler: ${endpointName}
 */
const ${handlerName} = async (req: Request, { ${contextParams} }: any) => {
  // =========================================================================
  // TODO: Implement the service or data you are selling here!
  //
  // This code only executes AFTER the client successfully completes the
  // x402 micropayment challenge and passes spend guard / trust policies.
  //
  // Ideas:
  // - Run an AI model inference or compute job
  // - Fetch private database records or real-time data feeds
  // - Call a premium upstream API or microservice
  // =========================================================================

  const servicePayload = {
    service: "${endpointName}",
    output: "Service executed successfully.",
    timestamp: new Date().toISOString(),
  };

  return NextResponse.json({
    success: true,
    message: "Resource unlocked successfully via x402 payment.",
    settlementReceipt: payment?.settlement,
    ${includeGuard ? "guardPolicy: guard?.policyDecision,\n    " : ""}${includeTrust ? "agentCaller: agent?.did,\n    " : ""}data: servicePayload,
  });
};

export const GET = ${pipeline};

export const POST = GET;
`;
}

export function generateRouteFile(
  options: MakeRouteOptions,
  projectRoot: string = process.cwd(),
): { filePath: string; routeUrl: string; payToTarget: string; priceTinybar: string; description: string } {
  if (!options.name || options.name.trim() === "") {
    throw new Error("Missing required endpoint name. Use --name <endpointName>.");
  }

  const cleanName = options.name.replace(/^api\//, "").replace(/^\/+|\/+$/g, "");
  const handlerName =
    cleanName
      .replace(/[^a-zA-Z0-9]+(.)/g, (_, chr) => chr.toUpperCase())
      .replace(/[^a-zA-Z0-9]/g, "") + "Handler";

  const priceHbar = options.priceHbar !== undefined ? options.priceHbar : 1;
  const priceTinybar = BigInt(Math.round(priceHbar * 100_000_000)).toString();
  const description = options.description?.trim() || `${cleanName} service`;

  const relRoutePath = options.customPath
    ? options.customPath.replace(/^\/+|\/+$/g, "")
    : `api/${cleanName}`;

  const destDir = path.resolve(projectRoot, "packages/nextjs/app", relRoutePath);
  const destFile = path.resolve(destDir, "route.ts");

  if (fs.existsSync(destFile) && !options.force) {
    throw new Error(
      `Route file already exists: ${destFile}\nUse --force to overwrite the existing endpoint.`,
    );
  }

  // Detect payment destination from .env.local
  let payToTarget = "0.0.X (Fallback)";
  const envPath = path.resolve(projectRoot, ".env.local");
  if (fs.existsSync(envPath)) {
    try {
      const env = parse(fs.readFileSync(envPath, "utf-8")) as Record<string, string>;
      if (env["NEXT_PUBLIC_VAULT_ADDRESS"] || env["VAULT_CONTRACT_ID"]) {
        payToTarget = `Vault (${env["NEXT_PUBLIC_VAULT_ADDRESS"] || env["VAULT_CONTRACT_ID"]})`;
      } else if (env["AGENT_ACCOUNT_ID"]) {
        payToTarget = `Seller Account (${env["AGENT_ACCOUNT_ID"]})`;
      }
    } catch {
      // ignore
    }
  }

  const includeGuard = !options.noGuard;
  const includeTrust = !!options.trust;

  const code = renderRouteCode({
    endpointName: cleanName,
    handlerName,
    priceHbar,
    priceTinybar,
    includeGuard,
    includeTrust,
  });

  fs.mkdirSync(destDir, { recursive: true });
  fs.writeFileSync(destFile, code, "utf-8");

  // Update routes-manifest.json for /skill.md discovery
  const manifestPath = path.resolve(projectRoot, "packages/nextjs/app/routes-manifest.json");
  try {
    let manifest: any[] = [];
    if (fs.existsSync(manifestPath)) {
      manifest = JSON.parse(fs.readFileSync(manifestPath, "utf-8"));
      if (!Array.isArray(manifest)) manifest = [];
    }
    const existingIndex = manifest.findIndex(
      (m: any) => m.name === cleanName || m.path === `/${relRoutePath}`,
    );
    const routeEntry = {
      name: cleanName,
      path: `/${relRoutePath}`,
      priceHbar,
      priceTinybar,
      description,
      trust: includeTrust,
      guard: includeGuard,
    };
    if (existingIndex >= 0) {
      manifest[existingIndex] = routeEntry;
    } else {
      manifest.push(routeEntry);
    }
    fs.mkdirSync(path.dirname(manifestPath), { recursive: true });
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + "\n", "utf-8");
  } catch {
    // Non-blocking manifest write
  }

  return {
    filePath: destFile,
    routeUrl: `/${relRoutePath}`,
    payToTarget,
    priceTinybar,
    description,
  };
}

export function printHelp(): void {
  console.log(`
Usage:
  yarn script:make-route --name <endpointName> [options]

Options:
  --name, -n <name>             Name of the API endpoint (required, e.g. sentiment, weather, compute)
  --price, -p <hbar>            Price per call in HBAR (default: 1 HBAR)
  --description, -d <desc>      Description of the resource for /skill.md discovery (default: "<name> service")
  --path <customPath>           Custom relative route path within packages/nextjs/app/
  --no-guard                    Disable automatic withSpendGuard inbound budget & policy enforcement
  --trust                       Enable withAgentTrust ERC-8004 agent identity verification
  --force, -f                   Overwrite destination file if it already exists
  --help, -h                    Show this help message

Examples:
  yarn script:make-route --name sentiment --price 0.5 --description "Real-time AI sentiment analysis"
  yarn script:make-route --name agent-compute --price 2 --trust
  yarn script:make-route --name free-probe --price 0.01 --no-guard
`);
}

export async function main() {
  const args = parseArgs(process.argv.slice(2));

  if (args.help || !args.name) {
    printHelp();
    if (!args.name && !args.help) {
      process.exit(1);
    }
    return;
  }

  try {
    const result = generateRouteFile(args);

    console.log("\n" + "=".repeat(78));
    console.log("  ⚡ Scaffold-HBAR: x402 Protected Route Generated");
    console.log("=".repeat(78));
    console.log(`  Endpoint Name:       ${args.name}`);
    console.log(`  Description:         ${result.description}`);
    console.log(`  Price:               ${args.priceHbar ?? 1} HBAR (${result.priceTinybar} tinybars)`);
    console.log(`  Revenue Destination: ${result.payToTarget}`);
    console.log(`  Guardrail Middleware: ${args.noGuard ? "Disabled (--no-guard)" : "Active (withSpendGuard)"}`);
    console.log(`  Agent Trust:         ${args.trust ? "Active (withAgentTrust)" : "Disabled"}`);
    console.log(`  File Created:        ${result.filePath}`);
    console.log(`  Route URL:           ${result.routeUrl}`);
    console.log("\n  Next Steps:");
    console.log(`  1. Open ${path.relative(process.cwd(), result.filePath)} and implement your service logic at the // TODO marker.`);
    console.log("  2. Test payment challenge negotiation locally:");
    console.log(`     curl -i http://localhost:3000${result.routeUrl}`);
    console.log("     (Should return HTTP 402 Payment Required with Hedera settlement instructions)");
    console.log("=".repeat(78) + "\n");
  } catch (err: any) {
    console.error(`\n❌ Failed to generate route: ${err.message}\n`);
    process.exit(1);
  }
}

if (require.main === module) {
  main();
}
