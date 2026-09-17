import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { ThrottleStore, createDefaultProfile, AuthorityLevel } from '@throttle/controller';
import { SweepGate, ConfirmedSpendEvent } from '../src/sweep-gate.js';
import { KeeperHubMcpClient } from '../src/mcp-client.js';

const TEST_CONFIRMED_TREASURY = '0x9e88D37203a2a5C65e8E63040719B6D939718A9F';

describe('KeeperHub Adapter: Sweep-Gate (Gate 3)', () => {
  beforeEach(() => {
    process.env.THROTTLE_TREASURY_ADDRESS = TEST_CONFIRMED_TREASURY;
  });

  it('Sweep-Gate: Authorizes and executes KeeperHub sweep for compliant confirmed spend', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-sweep-test', 'SweepAgent');
    store.saveAgent(profile);

    const sweepGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      keeperHubBaseUrl: 'https://app.keeperhub.com',
      sweepWorkflowId: 'wf-treasury-sweep',
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: true,
    });

    const spend: ConfirmedSpendEvent = {
      amount: '5000000', // 5.0 USDC
      amountUsd: 5.0,
      txHash: '0xclaimsettlementtx12345',
      taskId: 'task-market-001',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleConfirmedSpend('agent-sweep-test', spend);

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
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: true,
    });

    const spend: ConfirmedSpendEvent = {
      amount: '2000000', // 2.0 USDC
      amountUsd: 2.0,
      txHash: '0xclaimsettlementtx222',
      taskId: 'task-market-002',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleConfirmedSpend('agent-drifted', spend);

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
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: true,
    });

    const excessiveSpend: ConfirmedSpendEvent = {
      amount: '100000000', // 100.0 USDC (exceeds 10.0 single transfer cap)
      amountUsd: 100.0,
      txHash: '0xclaimsettlementtx333',
      taskId: 'task-market-003',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleConfirmedSpend('agent-sweep-violator', excessiveSpend);

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
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: false,
    });

    const spend: ConfirmedSpendEvent = {
      amount: '1000000',
      amountUsd: 1.0,
      txHash: '0xtx123',
      taskId: 'task-123',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleConfirmedSpend('agent-loud-fail', spend);

    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('KeeperHub upstream 503');

    // Verify failure logged in store
    const records = store.getActionRecords('agent-loud-fail');
    const failedRecord = records.find((r) => r.executionStatus === 'failed');
    expect(failedRecord).toBeDefined();
    expect(failedRecord?.errorMessage).toContain('KeeperHub upstream 503');
  });

  it('Sweep-Gate: Refuses to fabricate txHash and records failed action when execution succeeds without txHash', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-no-hash', 'NoHashAgent');
    store.saveAgent(profile);

    class NoTxHashMcpClient extends KeeperHubMcpClient {
      constructor() {
        super({ apiKey: 'mock_key' });
      }

      public override async executeWorkflow() {
        return {
          executionId: 'exec-no-hash-99',
          status: 'success' as const,
        };
      }

      public override async getExecution(executionId: string) {
        return {
          executionId,
          status: 'success' as const,
          // Explicitly no txHash or transactionHashes
        };
      }
    }

    const sweepGate = new SweepGate({
      store,
      mcpClient: new NoTxHashMcpClient(),
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: false,
    });

    const spend: ConfirmedSpendEvent = {
      amount: '3000000',
      amountUsd: 3.0,
      txHash: '0xclaimsettlementtx333',
      taskId: 'task-no-hash',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleConfirmedSpend('agent-no-hash', spend);

    // Failures must be loud, never masked with fabricated txHash
    expect(result.status).toBe('error');
    expect(result.txHash).toBeUndefined();
    expect(result.errorMessage).toContain(
      '[SweepGate] Workflow execution exec-no-hash-99 reported success but returned no transaction hash. Refusing to fabricate one.'
    );

    // Action record must be recorded as 'failed' with the real error message
    const records = store.getActionRecords('agent-no-hash');
    expect(records.length).toBe(1);
    const failedRecord = records[0];
    expect(failedRecord.executionStatus).toBe('failed');
    expect(failedRecord.errorMessage).toContain('Refusing to fabricate one');
  });

  it('KeeperHubMcpClient: simulateTransfer and executeTransfer stubs are deleted', () => {
    const client = new KeeperHubMcpClient({ apiKey: 'mock_key' });

    // Runtime assertion: stubs must be completely deleted
    expect((client as any).simulateTransfer).toBeUndefined();
    expect((client as any).executeTransfer).toBeUndefined();

    // Compile-time type check: properties must not exist on KeeperHubMcpClient type
    type HasSimulate = 'simulateTransfer' extends keyof KeeperHubMcpClient ? true : false;
    type HasExecute = 'executeTransfer' extends keyof KeeperHubMcpClient ? true : false;
    const hasSimulate: HasSimulate = false;
    const hasExecute: HasExecute = false;
    expect(hasSimulate).toBe(false);
    expect(hasExecute).toBe(false);
  });

  it('SweepGate: Fails loudly if treasury address is not configured anywhere', async () => {
    const origEnv = process.env.THROTTLE_TREASURY_ADDRESS;
    const origFallback = process.env.TREASURY_ADDRESS;
    delete process.env.THROTTLE_TREASURY_ADDRESS;
    delete process.env.TREASURY_ADDRESS;

    try {
      const store = new ThrottleStore(':memory:');
      const profile = createDefaultProfile('agent-no-treasury', 'NoTreasuryAgent');
      store.saveAgent(profile);

      const sweepGate = new SweepGate({
        store,
        keeperHubApiKey: 'mock_key',
        keeperHubBaseUrl: 'https://app.keeperhub.com',
        sweepWorkflowId: 'wf-treasury-sweep',
        simulationMode: true,
      });

      const spend: ConfirmedSpendEvent = {
        amount: '10000',
        amountUsd: 0.01,
        txHash: '0xmockhash',
        taskId: 'task-no-treasury',
        timestamp: Date.now(),
        tokenSymbol: 'USDC',
      };

      await expect(sweepGate.handleConfirmedSpend('agent-no-treasury', spend)).rejects.toThrow(
        /Missing required treasury address/
      );
    } finally {
      if (origEnv) process.env.THROTTLE_TREASURY_ADDRESS = origEnv;
      if (origFallback) process.env.TREASURY_ADDRESS = origFallback;
    }
  });

  it('Phase 0: Live mode strictly enforces THROTTLE_TREASURY_ADDRESS and logs resolution source', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-phase0', 'Phase0Agent');
    store.saveAgent(profile);

    process.env.THROTTLE_TREASURY_ADDRESS = TEST_CONFIRMED_TREASURY;

    const consoleSpy = vi.spyOn(console, 'log');

    const sweepGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      keeperHubBaseUrl: 'https://app.keeperhub.com',
      sweepWorkflowId: 'wf-treasury-sweep',
      simulationMode: true,
    });

    const spend: ConfirmedSpendEvent = {
      amount: '10000',
      amountUsd: 0.01,
      txHash: '0xmockphase0',
      taskId: 'task-phase0',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const result = await sweepGate.handleConfirmedSpend('agent-phase0', spend);
    expect(result.status).toBe('executed');

    expect(consoleSpy).toHaveBeenCalledWith(
      `[SweepGate] Resolved treasury destination: ${TEST_CONFIRMED_TREASURY} (source: env: THROTTLE_TREASURY_ADDRESS)`
    );

    consoleSpy.mockRestore();
  });

  it('Phase 0: Live mode rejects contradicting treasury destinations loudly', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-contradict', 'ContradictAgent');
    store.saveAgent(profile);

    process.env.THROTTLE_TREASURY_ADDRESS = TEST_CONFIRMED_TREASURY;

    const spend: ConfirmedSpendEvent = {
      amount: '10000',
      amountUsd: 0.01,
      txHash: '0xmockcontradict',
      taskId: 'task-contradict',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    // Contradicting config in live mode
    const badConfigGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      sweepWorkflowId: 'wf-treasury-sweep',
      treasuryAddress: '0x1111111111111111111111111111111111111111',
      simulationMode: false,
    });
    await expect(badConfigGate.handleConfirmedSpend('agent-contradict', spend)).rejects.toThrow(
      /contradicts env THROTTLE_TREASURY_ADDRESS/
    );

    // Contradicting param in live mode
    const goodConfigGate = new SweepGate({
      store,
      keeperHubApiKey: 'mock_key',
      sweepWorkflowId: 'wf-treasury-sweep',
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: false,
    });
    await expect(
      goodConfigGate.handleConfirmedSpend('agent-contradict', spend, '0x2222222222222222222222222222222222222222')
    ).rejects.toThrow(/contradicts env THROTTLE_TREASURY_ADDRESS/);
  });

  it('Phase 5: Fails loudly when KeeperHub API key is missing outside simulation mode', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-no-kh-key', 'NoKeyAgent');
    store.saveAgent(profile);

    process.env.THROTTLE_TREASURY_ADDRESS = TEST_CONFIRMED_TREASURY;

    const spend: ConfirmedSpendEvent = {
      amount: '10000',
      amountUsd: 0.01,
      txHash: '0xmocknokey',
      taskId: 'task-nokey',
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    const gate = new SweepGate({
      store,
      // keeperHubApiKey omitted
      sweepWorkflowId: 'wf-treasury-sweep',
      treasuryAddress: TEST_CONFIRMED_TREASURY,
      simulationMode: false,
    });

    const result = await gate.handleConfirmedSpend('agent-no-kh-key', spend);
    expect(result.status).toBe('error');
    expect(result.errorMessage).toContain('Missing required API key');
  });
});

