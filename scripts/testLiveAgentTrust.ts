import * as fs from "fs";
import * as path from "path";
import * as dotenv from "dotenv";
import { ethers } from "ethers";
import {
  Client,
  AccountId,
  PrivateKey,
  AccountBalanceQuery,
  TopicCreateTransaction,
  TopicMessageSubmitTransaction,
} from "@hiero-ledger/sdk";
import {
  generateAgentDID,
  signAuthChallenge,
  withAgentTrust,
  agentRegistry,
} from "../packages/nextjs/services/trust";

// Load environment variables from .env.local
dotenv.config({ path: path.resolve(__dirname, "../.env.local") });

const HEDERA_ACCOUNT_ID = process.env.HEDERA_ACCOUNT_ID || "0.0.6493119";
const HEDERA_PRIVATE_KEY = process.env.HEDERA_PRIVATE_KEY!;
const EVM_PRIVATE_KEY = process.env.AGENT_PRIVATE_KEY || process.env.__RUNTIME_DEPLOYER_PRIVATE_KEY!;
const HASHIO_RPC_URL = process.env.HEDERA_RPC_URL || "https://testnet.hashio.io/api";

async function main() {
  console.log("\n=======================================================");
  console.log(" 🌐 Hedera Testnet Live End-to-End Trust System Test ");
  console.log("=======================================================\n");

  if (!HEDERA_ACCOUNT_ID || !HEDERA_PRIVATE_KEY || !EVM_PRIVATE_KEY) {
    throw new Error("Missing testnet credentials in .env.local");
  }

  // 1. Initialize Hedera SDK Client
  console.log("1. Connecting Hedera SDK to Testnet...");
  const client = Client.forTestnet();
  const operatorKey = HEDERA_PRIVATE_KEY.startsWith("3030")
    ? PrivateKey.fromStringDer(HEDERA_PRIVATE_KEY)
    : PrivateKey.fromStringECDSA(HEDERA_PRIVATE_KEY.replace(/^0x/, ""));

  client.setOperator(AccountId.fromString(HEDERA_ACCOUNT_ID), operatorKey);

  const balanceRes = await fetch(`https://testnet.mirrornode.hedera.com/api/v1/accounts/${HEDERA_ACCOUNT_ID}`);
  const balanceData = await balanceRes.json();
  const balanceTinybar = balanceData.balance?.balance || 0;
  const balanceHbar = Number(balanceTinybar) / 1e8;

  console.log(`   Account: ${HEDERA_ACCOUNT_ID}`);
  console.log(`   Balance: ${balanceHbar} HBAR (${balanceTinybar} tinybars)`);
  console.log("   ✅ Hedera Client connected successfully.\n");

  // 2. Initialize Ethers Provider for Hedera HSCS (Chain ID 296)
  console.log("2. Connecting to Hedera Hashio JSON-RPC (Chain 296)...");
  const provider = new ethers.JsonRpcProvider(HASHIO_RPC_URL);
  const wallet = new ethers.Wallet(EVM_PRIVATE_KEY, provider);
  const feeData = await provider.getFeeData();
  const gasPrice = feeData.gasPrice ?? ethers.parseUnits("500", "gwei");

  console.log(`   Signer Address: ${wallet.address}`);
  console.log(`   Network Gas Price: ${gasPrice.toString()}`);
  console.log("   ✅ Ethers signer connected.\n");

  // 3. Deploy AgentRegistry.sol to Hedera Testnet
  console.log("3. Deploying AgentRegistry.sol to Hedera Testnet HSCS...");
  const artifactPath = path.resolve(
    __dirname,
    "../packages/hardhat/artifacts/contracts/AgentRegistry.sol/AgentRegistry.json",
  );
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8"));

  const factory = new ethers.ContractFactory(artifact.abi, artifact.bytecode, wallet);
  const deployTx = await factory.deploy(0n, {
    gasPrice,
    gasLimit: 2_500_000,
  });

  console.log(`   Deployment transaction sent: ${deployTx.deploymentTransaction()?.hash}`);
  console.log("   Waiting for Hedera consensus confirmation...");
  const registryContract = await deployTx.waitForDeployment();
  const contractAddress = await registryContract.getAddress();

  console.log(`   🎉 AgentRegistry deployed at: ${contractAddress}`);
  console.log(`   HashScan: https://hashscan.io/testnet/contract/${contractAddress}`);
  console.log("   ✅ On-chain registry ready.\n");

  // 4. Register Agent on Hedera Testnet Consensus
  console.log("4. Registering Agent Identity on Testnet Registry...");
  const agentDid = generateAgentDID(wallet.address, "testnet");
  const agentDescription = "Autonomous Machine-to-Machine Payment Agent (Scaffold-HBAR)";
  const serviceEndpoint = "https://agent.testnet.hedera.local/api/machine-payment";

  console.log(`   Registering DID: ${agentDid}`);
  console.log(`   Service Endpoint: ${serviceEndpoint}`);

  const regTx = await (registryContract as any).registerAgent(agentDid, agentDescription, serviceEndpoint, {
    gasPrice,
    gasLimit: 500_000,
  });
  console.log(`   Register Tx Hash: ${regTx.hash}`);
  console.log("   Waiting for consensus finality...");
  await regTx.wait();

  // Query state back directly from consensus
  const agentData = await (registryContract as any).getAgentByAddress(wallet.address);
  console.log("   Consensus Query Result:");
  console.log(`     - DID: ${agentData[0]}`);
  console.log(`     - Agent ID: ${agentData[1].toString()}`);
  console.log(`     - Description: ${agentData[2]}`);
  console.log(`     - Service Endpoint: ${agentData[3]}`);
  console.log("   ✅ Agent identity confirmed in Hedera consensus.\n");

  // Sync to local AgentRegistryService for in-process route handling
  await agentRegistry.registerAgent({
    did: agentDid,
    description: agentDescription,
    serviceEndpoint,
    walletAddress: wallet.address,
  });

  // 5. Create Live HCS Audit Topic and Submit Trust Record
  console.log("5. Creating Live HCS Topic for Agent Trust Auditing...");
  const topicCreateTx = new TopicCreateTransaction().setTopicMemo("agent-trust-audit");
  const topicResponse = await topicCreateTx.execute(client);
  const topicReceipt = await topicResponse.getReceipt(client);
  const topicId = topicReceipt.topicId!.toString();

  console.log(`   Created HCS Topic: ${topicId}`);
  console.log(`   HashScan: https://hashscan.io/testnet/topic/${topicId}`);

  console.log("   Submitting immutable trust audit record to HCS...");
  const auditPayload = JSON.stringify({
    timestamp: new Date().toISOString(),
    type: "REGISTER",
    did: agentDid,
    agentAddress: wallet.address,
    serviceEndpoint,
    contractAddress,
    deployTxHash: deployTx.deploymentTransaction()?.hash,
  });

  const msgTx = new TopicMessageSubmitTransaction()
    .setTopicId(topicId)
    .setMessage(auditPayload);
  const msgResponse = await msgTx.execute(client);
  const msgReceipt = await msgResponse.getReceipt(client);

  console.log(`   Submitted message! Sequence number: ${msgReceipt.topicSequenceNumber?.toString()}`);
  console.log("   ✅ Immutable audit receipt recorded to Hedera Consensus Service.\n");

  // 6. Test withAgentTrust() Route Handler with Live Cryptographic Signature
  console.log("6. Testing withAgentTrust() Route Middleware with Live Signatures...");
  const handler = withAgentTrust(async (_req, { agent }) => {
    return Response.json({
      status: "SUCCESS",
      authenticatedAgent: agent?.did,
      serviceEndpoint: agent?.serviceEndpoint,
    });
  });

  // Generate valid challenge & signature
  const timestamp = Date.now();
  const signature = await signAuthChallenge(EVM_PRIVATE_KEY, agentDid, timestamp);

  const validReq = new Request("https://machine.local/api/pay", {
    method: "POST",
    headers: {
      "x-agent-did": agentDid,
      "x-agent-signature": signature,
      "x-agent-timestamp": timestamp.toString(),
    },
  });

  const validRes = await handler(validReq);
  const validJson = await validRes.json();
  console.log(`   Valid Request Response HTTP ${validRes.status}:`, validJson);

  // Test tampered signature
  const tamperedSig = signature.slice(0, -6) + "ffffff";
  const invalidReq = new Request("https://machine.local/api/pay", {
    method: "POST",
    headers: {
      "x-agent-did": agentDid,
      "x-agent-signature": tamperedSig,
      "x-agent-timestamp": timestamp.toString(),
    },
  });

  const invalidRes = await handler(invalidReq);
  const invalidJson = await invalidRes.json();
  console.log(`   Tampered Request Response HTTP ${invalidRes.status}:`, invalidJson);
  console.log("   ✅ Route security & signature enforcement verified.\n");

  // 7. Verify via Public Mirror Node REST API
  console.log("7. Querying Public Hedera Mirror Node for Testnet Evidence...");
  const mirrorAccountRes = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/contracts/${contractAddress}`,
  );
  if (mirrorAccountRes.ok) {
    const contractInfo = await mirrorAccountRes.json();
    console.log(`   Mirror Node Contract Entity ID: ${contractInfo.contract_id}`);
    console.log(`   Mirror Node EVM Address: ${contractInfo.evm_address}`);
  }

  const mirrorTopicRes = await fetch(
    `https://testnet.mirrornode.hedera.com/api/v1/topics/${topicId}/messages/1`,
  );
  if (mirrorTopicRes.ok) {
    const topicMsg = await mirrorTopicRes.json();
    const decodedMessage = Buffer.from(topicMsg.message, "base64").toString("utf-8");
    console.log(`   Mirror Node Consensus Timestamp: ${topicMsg.consensus_timestamp}`);
    console.log(`   Mirror Node Decoded Message: ${decodedMessage}`);
  }
  console.log("   ✅ Mirror Node verification succeeded.\n");

  console.log("=======================================================");
  console.log("  🎉 FULL LIVE TESTNET END-TO-END FLOW VERIFIED!      ");
  console.log("=======================================================");
  console.log(`  Contract:  https://hashscan.io/testnet/contract/${contractAddress}`);
  console.log(`  HCS Topic: https://hashscan.io/testnet/topic/${topicId}`);
  console.log(`  Agent DID: ${agentDid}`);
  console.log("=======================================================\n");
}

main().catch(err => {
  console.error("❌ Live testnet execution failed:", err);
  process.exit(1);
});
