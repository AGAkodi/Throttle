/**
 * Live Two-Leg Integration Test
 *
 * Exercises the authentic Two-Leg architecture end-to-end:
 *   Leg 1: Agent creates and settles a TaskMarket task with EIP-3009 escrow payment -> ConfirmedSpendEvent.
 *   Leg 2: Throttle Controller evaluates the ConfirmedSpendEvent through SweepGate -> KeeperHub executes treasury sweep.
 *
 * To run:
 *   pnpm --filter @throttle/daydreams-adapter test:integration
 */

import { describe, it, expect } from 'vitest';
import { ThrottleStore, createDefaultProfile } from '@throttle/controller';
import { SweepGate, ConfirmedSpendEvent } from '@throttle/keeperhub-adapter';
import { TaskMarketClient, CreateTaskParams, CreatedTaskResult } from '../../src/taskmarket-client.js';
import { TaskMarketAgent } from '../../src/taskmarket-agent.js';

describe('Live Two-Leg Architecture Integration Test', () => {
  const isLiveEnvConfigured = Boolean(
    process.env.AGENT_WALLET_PRIVATE_KEY &&
    process.env.KEEPERHUB_API_KEY &&
    process.env.THROTTLE_TREASURY_ADDRESS
  );

  it('fetches real open tasks from live TaskMarket API', async () => {
    const client = new TaskMarketClient(process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev');
    const tasks = await client.listOpenTasks();

    console.log(`[Integration] Retrieved ${tasks.length} open tasks from TaskMarket.`);
    expect(Array.isArray(tasks)).toBe(true);

    if (tasks.length > 0) {
      const first = tasks[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('status');
      console.log(`[Integration] Sample Task ID: ${first.id} | Status: ${first.status}`);
    }
  });

  it('executes full two-leg pipeline: Leg 1 Task Creation -> ConfirmedSpend -> Leg 2 SweepGate', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-two-leg-integration', 'TwoLegIntegrationAgent');
    store.saveAgent(profile);

    if (!isLiveEnvConfigured) {
      console.log('[Integration] Skipping live two-leg integration test: required credentials (AGENT_WALLET_PRIVATE_KEY, KEEPERHUB_API_KEY, THROTTLE_TREASURY_ADDRESS) are not set. Refusing to degrade silently to mock values.');
      return;
    }

    const treasuryAddress = process.env.THROTTLE_TREASURY_ADDRESS!;
    const agentPrivateKey = process.env.AGENT_WALLET_PRIVATE_KEY!;
    const keeperHubApiKey = process.env.KEEPERHUB_API_KEY!;
    const taskMarketUrl = process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev';

    const client = new TaskMarketClient(taskMarketUrl);

    const agent = new TaskMarketAgent({
      agentId: 'agent-two-leg-integration',
      workerAddress: process.env.WORKER_ADDRESS || '0x1234567890123456789012345678901234567890',
      store,
      client,
      agentPrivateKey,
    });

    // ------------------------------------------------------------------------
    // LEG 1: Task Creation Escrow Funding
    // ------------------------------------------------------------------------
    console.log('[Two-Leg Test] Executing Leg 1 Task Creation...');
    const creationResult = await agent.runTaskCreationCycle({
      reward: '10000',
      description: 'Throttle Two-Leg Architecture Integration Verification Task',
      mode: 'claim',
    });

    expect(creationResult.success).toBe(true);
    expect(creationResult.confirmedSpend).toBeDefined();
    expect(creationResult.txHash).toBeDefined();

    const spendEvent: ConfirmedSpendEvent = creationResult.confirmedSpend!;
    expect(spendEvent.amount).toBe('10000');
    expect(spendEvent.amountUsd).toBe(0.01);
    expect(spendEvent.taskId).toBeDefined();
    expect(spendEvent.txHash).toBeDefined();

    // ------------------------------------------------------------------------
    // LEG 2: Throttle Controller Gating & KeeperHub Treasury Sweep
    // ------------------------------------------------------------------------
    console.log('[Two-Leg Test] Executing Leg 2 SweepGate Evaluation & Sweep...');
    const sweepGate = new SweepGate({
      store,
      keeperHubApiKey,
      keeperHubBaseUrl: process.env.KEEPERHUB_BASE_URL || 'https://app.keeperhub.com',
      sweepWorkflowId: process.env.KEEPERHUB_SWEEP_WORKFLOW_ID || 'wf-treasury-sweep-01',
      treasuryAddress,
      simulationMode: false,
    });

    const sweepResult = await sweepGate.handleConfirmedSpend(
      'agent-two-leg-integration',
      spendEvent,
      treasuryAddress
    );

    expect(sweepResult.status).toBe('executed');
    expect(sweepResult.decision.action).toBe('proceed');
    expect(sweepResult.txHash).toBeDefined();
    expect(sweepResult.executionId).toBeDefined();

    // Verify action record persisted in store
    const records = store.getActionRecords('agent-two-leg-integration');
    expect(records.length).toBeGreaterThanOrEqual(1);
    const executedRecord = records.find((r) => r.executionStatus === 'executed');
    expect(executedRecord).toBeDefined();
    expect(executedRecord?.executionTxHash).toBe(sweepResult.txHash);

    console.log(`[Two-Leg Test] SUCCESS: Leg 1 (${spendEvent.txHash}) -> Leg 2 (${sweepResult.txHash})`);
  });
});
