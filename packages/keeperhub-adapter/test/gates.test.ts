import { describe, it, expect } from 'vitest';
import { ThrottleStore, createDefaultProfile, AuthorityLevel } from '@throttle/controller';
import { SignGate, X402ChallengePayload } from '../src/sign-gate.js';
import { createDynamicAutonomyHook } from '../src/pretooluse-hook.js';

describe('KeeperHub Adapter: Dual Gate System', () => {
  it('Gate 1 (PreToolUse): Evaluates coarse tool calls and returns allow/deny hook decision', async () => {
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

  it('Gate 2 (Sign-Gate): Intercepts real 402 challenge and signs when permitted', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-sign-test', 'SignGateAgent');
    store.saveAgent(profile);

    const signGate = new SignGate({
      store,
      keeperHubBaseUrl: 'https://app.keeperhub.com',
      keeperHubHmacSecret: 'mock_secret',
      keeperHubSubOrgId: 'mock_sub_org',
      simulationMode: true,
    });

    const standardChallenge: X402ChallengePayload = {
      chain: 'base',
      contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: '0x3333333333333333333333333333333333333333',
      amount: '1000000', // 1.0 USDC
      validBefore: Math.floor(Date.now() / 1000) + 3600,
      validAfter: Math.floor(Date.now() / 1000) - 60,
      nonce: '0x123456789abcdef',
    };

    const result = await signGate.handlePaymentChallenge('agent-sign-test', standardChallenge);
    expect(result.status).toBe('signed');
    expect(result.signature).toBeDefined();
    expect(result.decision.action).toBe('proceed');
  });

  it('Gate 2 (Sign-Gate): Freezes and rejects when policy constraint violated', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-violator', 'ViolatorAgent', {
      maxSingleTransferUsd: 10.0,
    });
    store.saveAgent(profile);

    const signGate = new SignGate({
      store,
      keeperHubBaseUrl: 'https://app.keeperhub.com',
      keeperHubHmacSecret: 'mock_secret',
      keeperHubSubOrgId: 'mock_sub_org',
      simulationMode: true,
    });

    const excessiveChallenge: X402ChallengePayload = {
      chain: 'base',
      contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: '0x3333333333333333333333333333333333333333',
      amount: '50000000', // 50.0 USDC (exceeds 10.0 limit)
      validBefore: Math.floor(Date.now() / 1000) + 3600,
      validAfter: Math.floor(Date.now() / 1000) - 60,
      nonce: '0xabcdef',
    };

    const result = await signGate.handlePaymentChallenge('agent-violator', excessiveChallenge);
    expect(result.status).toBe('rejected');
    expect(result.signature).toBeUndefined();
    expect(result.decision.action).toBe('reject');
    expect(result.decision.metadata.authorityLevel).toBe(AuthorityLevel.FROZEN);
  });
});
