import { describe, it, expect } from 'vitest';
import { ThrottleStore, createDefaultProfile, AuthorityLevel } from '@throttle/controller';
import { SignGate } from '@throttle/keeperhub-adapter';
import { generateDynamicPolicyGroups } from '../src/dynamic-policy-groups.js';
import { BehaviorEmitter } from '../src/behavior-emitter.js';
import { TaskMarketAgent } from '../src/taskmarket-agent.js';
import { TaskMarketClient } from '../src/taskmarket-client.js';

describe('Daydreams / TaskMarket Adapter', () => {
  it('generates dynamic policy groups corresponding to each authority level', () => {
    const profile = createDefaultProfile('agent-policy-test', 'AgentPolicy');

    // Level 0: Full Autonomy
    profile.currentAuthorityLevel = AuthorityLevel.FULL_AUTONOMY;
    const l0Groups = generateDynamicPolicyGroups(profile);
    expect(l0Groups[0].isHalted).toBe(false);
    expect(l0Groups[0].maxPaymentUsd).toBe(50);

    // Level 3: Restricted Scope
    profile.currentAuthorityLevel = AuthorityLevel.RESTRICTED;
    const l3Groups = generateDynamicPolicyGroups(profile);
    expect(l3Groups[0].isHalted).toBe(false);
    expect(l3Groups[0].maxPaymentUsd).toBe(12.5); // 50 * 0.25

    // Level 4: Approval Required
    profile.currentAuthorityLevel = AuthorityLevel.APPROVAL_REQUIRED;
    const l4Groups = generateDynamicPolicyGroups(profile);
    expect(l4Groups[0].isHalted).toBe(true);

    // Level 5: Frozen
    profile.currentAuthorityLevel = AuthorityLevel.FROZEN;
    const l5Groups = generateDynamicPolicyGroups(profile);
    expect(l5Groups[0].isHalted).toBe(true);
  });

  it('updates telemetry metrics via BehaviorEmitter', () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-emitter-test', 'EmitterAgent');
    store.saveAgent(profile);

    const emitter = new BehaviorEmitter(store);

    emitter.emit({ agentId: 'agent-emitter-test', actionId: 'act-1', type: 'attempt' });
    emitter.emit({ agentId: 'agent-emitter-test', actionId: 'act-1', type: 'retry' });
    emitter.emit({ agentId: 'agent-emitter-test', actionId: 'act-1', type: 'retry' });

    const updated = store.getAgent('agent-emitter-test');
    expect(updated?.metrics.totalActions).toBe(1);
    expect(updated?.metrics.recentRetries).toBe(2);

    emitter.emit({ agentId: 'agent-emitter-test', actionId: 'act-1', type: 'success' });
    const successUpdated = store.getAgent('agent-emitter-test');
    expect(successUpdated?.metrics.successfulActions).toBe(1);
    expect(successUpdated?.metrics.recentRetries).toBe(0); // reset on success
  });

  it('runs end-to-end task cycle through TaskMarketAgent with canonical EIP-191 claim signing', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-cycle-test', 'CycleAgent');
    store.saveAgent(profile);

    class MockTaskMarketClient extends TaskMarketClient {
      public claimsMade: Array<{ taskId: string; workerAddress: string; signature: string }> = [];

      constructor() {
        super('http://mock-taskmarket.local');
      }

      public override async listOpenTasks() {
        return [
          {
            id: 'task-deterministic-001',
            title: 'Deterministic Test Bounty',
            type: 'bounty',
            mode: 'claim' as const,
            status: 'open' as const,
            reward: '10000',
            creatorAddress: '0x1234567890123456789012345678901234567890',
            createdAt: new Date().toISOString(),
          },
        ];
      }

      public override async claimTask(taskId: string, workerAddress: string, signature: string) {
        this.claimsMade.push({ taskId, workerAddress, signature });

        return {
          status: 200,
          success: true,
          claimId: 'claim-123-abc',
          data: {
            success: true,
            claimId: 'claim-123-abc',
          },
        };
      }
    }

    const testPrivateKey = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f361b97';
    const mockClient = new MockTaskMarketClient();
    const agent = new TaskMarketAgent({
      agentId: 'agent-cycle-test',
      workerAddress: '0x1234567890123456789012345678901234567890',
      store,
      client: mockClient,
      agentPrivateKey: testPrivateKey,
    });

    const result = await agent.runCycle();

    // 1. Result structure
    expect(result.success).toBe(true);
    expect(result.stage).toBe('settlement');
    expect(result.signature).toBeDefined();
    expect(result.signature?.startsWith('0x')).toBe(true);
    expect(result.authorityLevel).toBe(AuthorityLevel.FULL_AUTONOMY);
    expect(result.taskId).toBe('task-deterministic-001');
    expect(result.claimId).toBe('claim-123-abc');

    // 2. Client interaction: exactly ONE call with EIP-191 signature directly
    expect(mockClient.claimsMade).toHaveLength(1);
    expect(mockClient.claimsMade[0].signature).toBe(result.signature);
    expect(mockClient.claimsMade[0].workerAddress).toBe('0x1234567890123456789012345678901234567890');

    // 3. Telemetry metrics updated
    const updatedProfile = store.getAgent('agent-cycle-test');
    expect(updatedProfile?.metrics.totalActions).toBeGreaterThanOrEqual(1);
    expect(updatedProfile?.metrics.successfulActions).toBeGreaterThanOrEqual(1);
  });

  it('signs canonical claim message directly with agent private key and emits ConfirmedSpend event', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-self-sign', 'SelfSignAgent');
    store.saveAgent(profile);

    class MockTaskMarketClient extends TaskMarketClient {
      constructor() {
        super('http://mock-taskmarket.local');
      }

      public override async listOpenTasks() {
        return [
          {
            id: 'task-direct-sign-001',
            title: 'Direct Sign Bounty',
            type: 'bounty',
            mode: 'claim' as const,
            status: 'open' as const,
            reward: '2500000', // 2.5 USDC
            creatorAddress: '0x1234567890123456789012345678901234567890',
            createdAt: new Date().toISOString(),
          },
        ];
      }

      public override async claimTask(taskId: string, workerAddress: string, signature: string) {
        return {
          status: 200,
          success: true,
          claimId: 'claim-direct-001',
          data: {
            success: true,
            claimId: 'claim-direct-001',
            txHash: '0xrealconfirmedsettlementhash888',
          },
        };
      }
    }

    const testPrivateKey = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f361b97';
    const mockClient = new MockTaskMarketClient();
    const agent = new TaskMarketAgent({
      agentId: 'agent-self-sign',
      workerAddress: '0x1234567890123456789012345678901234567890',
      store,
      client: mockClient,
      agentPrivateKey: testPrivateKey,
    });

    const result = await agent.runCycle();

    expect(result.success).toBe(true);
    expect(result.stage).toBe('settlement');
    expect(result.signature).toBeDefined();
    expect(result.signature?.startsWith('0x')).toBe(true);
    expect(result.txHash).toBe('0xrealconfirmedsettlementhash888');

    // Verify ConfirmedSpendEvent
    expect(result.confirmedSpend).toBeDefined();
    expect(result.confirmedSpend?.amount).toBe('2500000');
    expect(result.confirmedSpend?.amountUsd).toBe(2.5);
    expect(result.confirmedSpend?.taskId).toBe('task-direct-sign-001');
    expect(result.confirmedSpend?.txHash).toBe('0xrealconfirmedsettlementhash888');
    expect(result.confirmedSpend?.tokenSymbol).toBe('USDC');
  });

  it('fails loudly when claim call returns an error', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-fail-claim', 'FailClaimAgent');
    store.saveAgent(profile);

    class MockTaskMarketFailClient extends TaskMarketClient {
      constructor() {
        super('http://mock-taskmarket.local');
      }

      public override async listOpenTasks() {
        return [
          {
            id: 'task-fail-001',
            title: 'Fail Task',
            type: 'bounty',
            mode: 'claim' as const,
            status: 'open' as const,
            creatorAddress: '0x1234567890123456789012345678901234567890',
            createdAt: new Date().toISOString(),
          },
        ];
      }

      public override async claimTask(_taskId: string, _workerAddress: string, _signature: string) {
        return {
          status: 400,
          success: false,
          error: 'Task not available for claiming',
          data: {
            message: 'Task not available for claiming',
            code: 'BAD_REQUEST',
          },
        };
      }
    }

    const testPrivateKey = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f361b97';
    const mockClient = new MockTaskMarketFailClient();
    const agent = new TaskMarketAgent({
      agentId: 'agent-fail-claim',
      workerAddress: '0x1234567890123456789012345678901234567890',
      store,
      client: mockClient,
      agentPrivateKey: testPrivateKey,
    });

    const result = await agent.runCycle();

    expect(result.success).toBe(false);
    expect(result.stage).toBe('settlement');
    expect(result.error).toContain('Task not available for claiming');
  });

  it('runs task creation cycle and builds ConfirmedSpendEvent from confirmed task settlement', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-creation-test', 'CreationAgent');
    store.saveAgent(profile);

    class MockTaskMarketCreationClient extends TaskMarketClient {
      constructor() {
        super('http://mock-taskmarket.local');
      }

      public override async createAndSettleTask() {
        return {
          taskId: 'task-created-999',
          txHash: '0xconfirmedescrowtxhash999',
          intentId: 'intent-uuid-1234',
          status: 'created',
        };
      }
    }

    const testPrivateKey = '0x4c0883a69102937d6231471b5dbb6204fe5129617082792ae468d01a3f361b97';
    const mockClient = new MockTaskMarketCreationClient();
    const agent = new TaskMarketAgent({
      agentId: 'agent-creation-test',
      workerAddress: '0x1234567890123456789012345678901234567890',
      store,
      client: mockClient,
      agentPrivateKey: testPrivateKey,
    });

    const result = await agent.runTaskCreationCycle({
      reward: '10000',
      description: 'Test task creation',
    });

    expect(result.success).toBe(true);
    expect(result.stage).toBe('intent_settlement');
    expect(result.taskId).toBe('task-created-999');
    expect(result.txHash).toBe('0xconfirmedescrowtxhash999');
    expect(result.intentId).toBe('intent-uuid-1234');
    expect(result.confirmedSpend).toBeDefined();
    expect(result.confirmedSpend?.amount).toBe('10000');
    expect(result.confirmedSpend?.amountUsd).toBe(0.01);
    expect(result.confirmedSpend?.txHash).toBe('0xconfirmedescrowtxhash999');
    expect(result.confirmedSpend?.taskId).toBe('task-created-999');

    const updatedProfile = store.getAgent('agent-creation-test');
    expect(updatedProfile?.metrics.totalActions).toBeGreaterThanOrEqual(1);
    expect(updatedProfile?.metrics.successfulActions).toBeGreaterThanOrEqual(1);
  });
});



