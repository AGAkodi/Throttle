import { describe, it, expect } from 'vitest';
import { ThrottleStore, createDefaultProfile, AuthorityLevel } from '@throttle/controller';
import { SweepGate, EarningsReceivedEvent } from '../src/sweep-gate.js';
import { KeeperHubMcpClient } from '../src/mcp-client.js';

describe('KeeperHub Adapter: Sweep-Gate (Gate 3)', () => {
  it('Sweep-Gate: Authorizes and executes KeeperHub sweep for compliant earnings', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-sweep-test', 'SweepAgent');
    store.saveAgent(profile);

    const sweepGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      keeperHubBaseUrl: 'https://app.keeperhub.com',
      sweepWorkflowId: 'wf-treasury-sweep',
      treasuryAddress: '0x742d35Cc6634C0532925a3b844Bc454e4438f44e',
      simulationMode: true,
    });

    const earnings: EarningsReceivedEvent = {
      amount: '5000000', // 5.0 USDC
      amountUsd: 5.0,
      txHash: '0xclaimsettlementtx12345',
      taskId: 'task-market-001',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleEarningsReceived('agent-sweep-test', earnings);

    expect(result.status).toBe('executed');
    expect(result.txHash).toBeDefined();
    expect(result.executionId).toBeDefined();
    expect(result.decision.action).toBe('proceed');
    expect(result.decision.metadata.authorityLevel).toBe(AuthorityLevel.FULL_AUTONOMY);

    // Verify action record persisted in store
    const records = store.getActionRecords('agent-sweep-test');
    expect(records.length).toBeGreaterThan(0);
    const sweepRecord = records.find((r) => r.action.type === 'transfer' && r.action.protocol === 'keeperhub');
    expect(sweepRecord).toBeDefined();
    expect(sweepRecord?.executionStatus).toBe('executed');
    expect(sweepRecord?.action.amountUsd).toBe(5.0);
  });

  it('Sweep-Gate: Holds execution when controller requires human approval (Level 4)', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-drifted', 'DriftedAgent');
    profile.trustScore.current = 25.0; // Low trust triggers Level 4 (Approval Required)
    store.saveAgent(profile);

    const sweepGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      simulationMode: true,
    });

    const earnings: EarningsReceivedEvent = {
      amount: '2000000', // 2.0 USDC
      amountUsd: 2.0,
      txHash: '0xclaimsettlementtx222',
      taskId: 'task-market-002',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleEarningsReceived('agent-drifted', earnings);

    expect(result.status).toBe('held');
    expect(result.decision.action).toBe('hold');
    expect(result.txHash).toBeUndefined();

    // Verify action record is stored as pending
    const records = store.getActionRecords('agent-drifted');
    const pendingRecord = records.find((r) => r.executionStatus === 'pending');
    expect(pendingRecord).toBeDefined();
  });

  it('Sweep-Gate: Freezes and rejects when sweep violates policy constraints (Level 5)', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-sweep-violator', 'SweepViolator', {
      maxSingleTransferUsd: 10.0,
    });
    store.saveAgent(profile);

    const sweepGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      simulationMode: true,
    });

    const excessiveEarnings: EarningsReceivedEvent = {
      amount: '100000000', // 100.0 USDC (exceeds 10.0 single transfer cap)
      amountUsd: 100.0,
      txHash: '0xclaimsettlementtx333',
      taskId: 'task-market-003',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleEarningsReceived('agent-sweep-violator', excessiveEarnings);

    expect(result.status).toBe('rejected');
    expect(result.decision.action).toBe('reject');
    expect(result.txHash).toBeUndefined();
    expect(result.decision.metadata.authorityLevel).toBe(AuthorityLevel.FROZEN);

    // Verify rejected record persisted
    const records = store.getActionRecords('agent-sweep-violator');
    const rejectedRecord = records.find((r) => r.executionStatus === 'rejected');
    expect(rejectedRecord).toBeDefined();
  });

  it('Sweep-Gate: Fails loudly when live MCP execution errors without fallback', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-loud-fail', 'LoudFailAgent');
    store.saveAgent(profile);

    class ErroringMcpClient extends KeeperHubMcpClient {
      constructor() {
        super({ apiKey: 'mock_key' });
      }

      public override async executeWorkflow() {
        throw new Error('KeeperHub upstream 503 Service Unavailable');
      }
    }

    const sweepGate = new SweepGate({
      store,
      mcpClient: new ErroringMcpClient(),
      simulationMode: false,
    });

    const earnings: EarningsReceivedEvent = {
      amount: '1000000',
      amountUsd: 1.0,
      txHash: '0xtx123',
      taskId: 'task-123',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleEarningsReceived('agent-loud-fail', earnings);

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('KeeperHub upstream 503');

    // Verify failure logged in store
    const records = store.getActionRecords('agent-loud-fail');
    const failedRecord = records.find((r) => r.executionStatus === 'failed');
    expect(failedRecord).toBeDefined();
    expect(failedRecord?.errorMessage).toContain('KeeperHub upstream 503');
  });
});
