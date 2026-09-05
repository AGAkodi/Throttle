import { describe, it, expect } from 'vitest';
import { evaluatePolicy } from '../src/engines/policy-engine.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { ProposedAction, AuthorityLevel } from '../src/types.js';

describe('Layer 1: Policy Engine', () => {
  const baseProfile = createDefaultProfile('agent-1', 'TestAgent', {
    maxSingleTransferUsd: 50.0,
    maxHourlySpendUsd: 100.0,
    allowedChains: ['base'],
    allowedProtocols: ['taskmarket', 'keeperhub'],
    destinationBlocklist: ['0xbad0000000000000000000000000000000000bad'],
  });

  const validAction: ProposedAction = {
    id: 'act-1',
    agentId: 'agent-1',
    timestamp: Date.now(),
    type: 'payment',
    chain: 'base',
    protocol: 'taskmarket',
    destination: '0x1111111111111111111111111111111111111111',
    amount: '1000000',
    amountUsd: 1.0,
    tokenSymbol: 'USDC',
  };

  it('passes a standard compliant action', () => {
    const result = evaluatePolicy(validAction, baseProfile);
    expect(result.passed).toBe(true);
    expect(result.violations).toHaveLength(0);
  });

  it('blocks unapproved blockchain networks', () => {
    const action = { ...validAction, chain: 'ethereum' };
    const result = evaluatePolicy(action, baseProfile);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain("Chain 'ethereum' is not permitted");
  });

  it('blocks unapproved protocols', () => {
    const action = { ...validAction, protocol: 'unknown-dex' };
    const result = evaluatePolicy(action, baseProfile);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain("Protocol 'unknown-dex' is not permitted");
  });

  it('blocks explicitly blocklisted addresses', () => {
    const action = { ...validAction, destination: '0xbad0000000000000000000000000000000000bad' };
    const result = evaluatePolicy(action, baseProfile);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('explicitly blocklisted');
  });

  it('blocks actions exceeding maximum single transfer limits', () => {
    const action = { ...validAction, amountUsd: 75.0 };
    const result = evaluatePolicy(action, baseProfile);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('exceeds maximum single transfer limit');
  });

  it('enforces stricter spend caps in RESTRICTED authority mode', () => {
    const restrictedProfile = {
      ...baseProfile,
      currentAuthorityLevel: AuthorityLevel.RESTRICTED,
    };
    // 50 * 0.25 = 12.50 limit
    const action = { ...validAction, amountUsd: 15.0 };
    const result = evaluatePolicy(action, restrictedProfile);
    expect(result.passed).toBe(false);
    expect(result.violations[0]).toContain('scaled by restricted mode multiplier');
  });
});
