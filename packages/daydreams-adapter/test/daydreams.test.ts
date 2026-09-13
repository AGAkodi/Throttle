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

  it('runs end-to-end task cycle through TaskMarketAgent with SignGate authorization', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-cycle-test', 'CycleAgent');
    store.saveAgent(profile);

    const signGate = new SignGate({
      store,
      keeperHubBaseUrl: 'https://app.keeperhub.com',
      keeperHubHmacSecret: 'mock_secret',
      keeperHubSubOrgId: 'mock_sub_org',
      simulationMode: true,
    });

    class MockTaskMarketClient extends TaskMarketClient {
      public claimsMade: Array<{ taskId: string; workerAddress: string; paymentSignature?: string }> = [];

      constructor() {
        super('http://mock-taskmarket.local');
      }

      public override async listOpenTasks() {
        return [
          {
            id: 'task-deterministic-001',
            title: 'Deterministic Test Bounty',
            type: 'bounty',
            status: 'open' as const,
            creatorAddress: '0x1234567890123456789012345678901234567890',
            createdAt: new Date().toISOString(),
          },
        ];
      }

      public override async claimTask(taskId: string, workerAddress: string, paymentSignature?: string) {
        this.claimsMade.push({ taskId, workerAddress, paymentSignature });

        if (!paymentSignature) {
          // Return 402 challenge
          return {
            status: 402,
            paymentRequired: true,
            challenge: {
              chain: 'base',
              contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              payTo: '0x1234567890123456789012345678901234567890',
              amount: '1000000',
              validBefore: Math.floor(Date.now() / 1000) + 3600,
              validAfter: Math.floor(Date.now() / 1000) - 60,
              nonce: '0x1234567890abcdef',
            },
          };
        }

        // Settled with signature
        return {
          status: 200,
          paymentRequired: false,
          data: {
            success: true,
            txHash: '0xmocksettlementtxhash999',
          },
        };
      }
    }

    const mockClient = new MockTaskMarketClient();
    const agent = new TaskMarketAgent({
      agentId: 'agent-cycle-test',
      workerAddress: '0x1234567890123456789012345678901234567890',
      store,
      signGate,
      client: mockClient,
    });

    const result = await agent.runCycle();

    // 1. Result structure
    expect(result.success).toBe(true);
    expect(result.stage).toBe('settlement');
    expect(result.signature).toBeDefined();
    expect(result.authorityLevel).toBe(AuthorityLevel.FULL_AUTONOMY);
    expect(result.taskId).toBe('task-deterministic-001');

    // 2. Client interaction: two calls (challenge, then settlement with signature)
    expect(mockClient.claimsMade).toHaveLength(2);
    expect(mockClient.claimsMade[0].paymentSignature).toBeUndefined();
    expect(mockClient.claimsMade[1].paymentSignature).toBe(result.signature);

    // 3. Action record persisted in store
    const records = store.getActionRecords('agent-cycle-test');
    expect(records.length).toBeGreaterThan(0);
    const execRecord = records.find((r) => r.executionStatus === 'executed');
    expect(execRecord).toBeDefined();
    expect(execRecord?.executionTxHash).toBe(result.signature);
    expect(execRecord?.action.amountUsd).toBe(1.0);
    expect(execRecord?.action.destination).toBe('0x1234567890123456789012345678901234567890');

    // 4. Telemetry metrics updated
    const updatedProfile = store.getAgent('agent-cycle-test');
    expect(updatedProfile?.metrics.totalActions).toBeGreaterThanOrEqual(1);
    expect(updatedProfile?.metrics.successfulActions).toBeGreaterThanOrEqual(1);
  });

  it('signs outbound payment directly with agent private key and emits EarningsReceived event', async () => {
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
            status: 'open' as const,
            creatorAddress: '0x1234567890123456789012345678901234567890',
            createdAt: new Date().toISOString(),
          },
        ];
      }

      public override async claimTask(taskId: string, workerAddress: string, paymentSignature?: string) {
        if (!paymentSignature) {
          return {
            status: 402,
            paymentRequired: true,
            challenge: {
              chain: 'base',
              contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
              payTo: '0x1234567890123456789012345678901234567890',
              amount: '2500000', // 2.5 USDC
              validBefore: Math.floor(Date.now() / 1000) + 3600,
              validAfter: Math.floor(Date.now() / 1000) - 60,
              nonce: '0x1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef',
            },
          };
        }

        return {
          status: 200,
          paymentRequired: false,
          data: {
            success: true,
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

    // Verify EarningsReceivedEvent
    expect(result.earningsReceived).toBeDefined();
    expect(result.earningsReceived?.amount).toBe('2500000');
    expect(result.earningsReceived?.amountUsd).toBe(2.5);
    expect(result.earningsReceived?.taskId).toBe('task-direct-sign-001');
    expect(result.earningsReceived?.txHash).toBe('0xrealconfirmedsettlementhash888');
    expect(result.earningsReceived?.tokenSymbol).toBe('USDC');
  });
});
