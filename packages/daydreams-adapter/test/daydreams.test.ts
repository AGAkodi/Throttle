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

    const client = new TaskMarketClient();
    const agent = new TaskMarketAgent({
      agentId: 'agent-cycle-test',
      workerAddress: '0x1234567890123456789012345678901234567890',
      store,
      signGate,
      client,
    });

    const result = await agent.runCycle();
    expect(result.success).toBe(true);
    expect(result.stage).toBe('settlement');
    expect(result.signature).toBeDefined();
    expect(result.authorityLevel).toBe(AuthorityLevel.FULL_AUTONOMY);
  });
});
