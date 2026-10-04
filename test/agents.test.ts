import assert from 'assert';
import path from 'path';
import fs from 'fs';
import os from 'os';
import { JsonAgentStore } from '../packages/nextjs/services/agents/jsonStore';
import { fetchHederaAccountBalance } from '../packages/nextjs/utils/hederaBalance';

async function runTests() {
  console.log('=================================================');
  console.log('  🧪 Running Agent Store & Dashboard Offline Tests');
  console.log('=================================================\n');

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'mmp-test-'));
  const storePath = path.join(tmpDir, 'agents.json');
  const store = new JsonAgentStore(storePath);

  try {
    // Test 1: Agent creation and claim code minting
    console.log('Test 1: createAgent generates minted agent with 24h claim code...');
    const created = await store.createAgent({
      label: 'market-watcher-agent',
      spendLimitHbar: 25,
    });

    assert(created.agent.id.startsWith('agent_'), 'Agent ID should start with agent_');
    assert.strictEqual(created.agent.label, 'market-watcher-agent');
    assert.strictEqual(created.agent.state, 'minted');
    assert.strictEqual(created.agent.spendLimitHbar, 25);
    assert.strictEqual(created.agent.totalSpentTinybar, '0');
    assert(created.claimCode.startsWith('claim_'), 'Claim code should start with claim_');
    assert(created.agent.claim !== null, 'Claim should be present');
    console.log('  ✅ Passed: Agent minted successfully.\n');

    // Test 2: Claiming agent with claim code
    console.log('Test 2: claimAgent trades code for API key and registers wallet...');
    const claimRes = await store.claimAgent({
      claim: created.claimCode,
      walletAddress: '0x1234567890abcdef1234567890abcdef12345678',
      accountId: '0.0.987654',
      did: 'did:hedera:testnet:0.0.987654',
    });

    assert(claimRes.apiKey.startsWith('mmp_live_'), 'API key should start with mmp_live_');
    assert.strictEqual(claimRes.agent.state, 'wallet');
    assert.strictEqual(claimRes.agent.accountId, '0.0.987654');
    assert.strictEqual(claimRes.agent.walletAddress, '0x1234567890abcdef1234567890abcdef12345678');
    assert.strictEqual(claimRes.agent.claim, null, 'Claim code must be consumed and cleared');
    console.log('  ✅ Passed: Agent claimed and key issued.\n');

    // Test 3: Claim code replay rejection
    console.log('Test 3: Replaying consumed claim code should throw error...');
    let threwReplay = false;
    try {
      await store.claimAgent({
        claim: created.claimCode,
      });
    } catch {
      threwReplay = true;
    }
    assert.strictEqual(threwReplay, true, 'Consumed claim code must reject subsequent claims');
    console.log('  ✅ Passed: Replay protection verified.\n');

    // Test 4: Lookup agent by API key
    console.log('Test 4: getAgentByApiKey resolves correct agent record...');
    const foundAgent = await store.getAgentByApiKey(claimRes.apiKey);
    assert(foundAgent !== null, 'Agent should be found by API key');
    assert.strictEqual(foundAgent.id, created.agent.id);
    assert.strictEqual(foundAgent.label, 'market-watcher-agent');

    const notFound = await store.getAgentByApiKey('mmp_live_invalidkey123');
    assert.strictEqual(notFound, null, 'Invalid key should return null');
    console.log('  ✅ Passed: API key authentication lookup verified.\n');

    // Test 5: Spend recording and telemetry updates
    console.log('Test 5: recordSpend tracks payments and updates totals...');
    const spend1 = await store.recordSpend({
      agentId: created.agent.id,
      agentLabel: 'market-watcher-agent',
      route: '/api/x402/resource',
      amountTinybar: '100000000', // 1 HBAR
      amountHbar: '1.0000',
      txId: '0.0.123@1700000000.000000000',
      hcsSequenceNumber: '42',
    });

    assert(spend1.id.startsWith('spend_'), 'Spend event should have an id');
    assert.strictEqual(spend1.amountTinybar, '100000000');

    const updatedAgent = await store.getAgent(created.agent.id);
    assert.strictEqual(updatedAgent?.totalSpentTinybar, '100000000');
    console.log('  ✅ Passed: Spend event recorded and total updated.\n');

    // Test 6: Dashboard stats aggregation
    console.log('Test 6: getDashboardStats aggregates 24h/7d spend and chart buckets...');
    const stats = await store.getDashboardStats();
    assert.strictEqual(stats.totalAgents, 1);
    assert.strictEqual(stats.totalRequests, 1);
    assert.strictEqual(stats.spend24hTinybar, '100000000');
    assert.strictEqual(stats.spend24hHbar, '1.0000');
    assert.strictEqual(stats.recentActivity.length, 1);
    assert.strictEqual(stats.chartData.length, 14);
    assert(stats.topAgents.length > 0, 'Should include top agents');
    assert.strictEqual(stats.topAgents[0].id, created.agent.id);
    console.log('  ✅ Passed: Dashboard statistics aggregated accurately.\n');

    // Test 7: Hedera mirror node balance offline fallback
    console.log('Test 7: fetchHederaAccountBalance returns fallback in offline mode...');
    const offlineBal = await fetchHederaAccountBalance('0.0.999999', 'http://127.0.0.1:1');
    assert.strictEqual(offlineBal.hbar, '0');
    assert.strictEqual(offlineBal.tinybar, '0');
    console.log('  ✅ Passed: Mirror node lookup handles offline gracefully.\n');

    console.log('🎉 All 7 Agent Store and Dashboard Offline Tests Passed Successfully!\n');
  } finally {
    try {
      fs.rmSync(tmpDir, { recursive: true, force: true });
    } catch {
      // Best effort cleanup
    }
  }
}

runTests().catch((err) => {
  console.error('❌ Test suite failed:', err);
  process.exit(1);
});
