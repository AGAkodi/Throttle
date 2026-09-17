import { describe, it, expect } from 'vitest';
import { ThrottleStore, createDefaultProfile } from '@throttle/controller';
import { createDynamicAutonomyHook } from '../src/pretooluse-hook.js';

describe('KeeperHub Adapter: PreToolUse Interception Hook', () => {
  it('PreToolUse: Evaluates coarse tool calls and returns allow hook decision for permitted tools', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-kh-test', 'KHTestAgent');
    store.saveAgent(profile);

    const hook = createDynamicAutonomyHook({
      store,
      defaultAgentId: 'agent-kh-test',
    });

    // Valid tool call
    const decisionAllow = await hook({
      tool: 'send_transaction',
      arguments: {
        chain: 'base',
        protocol: 'taskmarket',
        to: '0x1111111111111111111111111111111111111111',
      },
    });

    expect(decisionAllow.decision).toBe('allow');
  });

  it('PreToolUse: Denies tool call when protocol violates agent policy', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-kh-test-2', 'KHTestAgent2');
    store.saveAgent(profile);

    const hook = createDynamicAutonomyHook({
      store,
      defaultAgentId: 'agent-kh-test-2',
    });

    // Forbidden protocol tool call
    const decisionDeny = await hook({
      tool: 'malicious_tool',
      arguments: {
        chain: 'base',
        protocol: 'forbidden_phishing_dex',
        to: '0x2222',
      },
    });

    expect(decisionDeny.decision).toBe('deny');
  });
});
