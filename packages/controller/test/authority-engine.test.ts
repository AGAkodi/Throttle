import { describe, it, expect } from 'vitest';
import { determineAuthority } from '../src/engines/authority-engine.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { AuthorityLevel, ProposedAction } from '../src/types.js';

describe('Layer 5: Authority Engine', () => {
  const profile = createDefaultProfile('agent-1', 'TestAgent');

  const sampleAction: ProposedAction = {
    id: 'act-1',
    agentId: 'agent-1',
    timestamp: Date.now(),
    type: 'payment',
    chain: 'base',
    protocol: 'taskmarket',
    destination: '0x1111',
    amount: '1000000',
    amountUsd: 1.0,
    tokenSymbol: 'USDC',
  };

  it('assigns FULL_AUTONOMY (Level 0) when all signals are optimal', () => {
    const policy = { passed: true, violations: [] };
    const risk = { score: 10, factors: [] };
    const drift = {
      detected: false,
      driftScore: 5,
      amountDeviationRatio: 1,
      frequencyDeviationRatio: 1,
      isNewDestination: false,
      isNewProtocol: false,
      recentFailureRate: 0,
      retryCount: 0,
      reasons: [],
    };
    const trust = 88;

    const result = determineAuthority(sampleAction, profile, policy, risk, drift, trust);
    expect(result.authorityLevel).toBe(AuthorityLevel.FULL_AUTONOMY);
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
    expect(result.isFrozen).toBe(false);
  });

  it('freezes execution (Level 5) on policy violations', () => {
    const policy = { passed: false, violations: ['Forbidden contract'] };
    const risk = { score: 10, factors: [] };
    const drift = {
      detected: false,
      driftScore: 0,
      amountDeviationRatio: 1,
      frequencyDeviationRatio: 1,
      isNewDestination: false,
      isNewProtocol: false,
      recentFailureRate: 0,
      retryCount: 0,
      reasons: [],
    };
    const trust = 80;

    const result = determineAuthority(sampleAction, profile, policy, risk, drift, trust);
    expect(result.authorityLevel).toBe(AuthorityLevel.FROZEN);
    expect(result.isFrozen).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it('requires human approval (Level 4) when risk is elevated', () => {
    const policy = { passed: true, violations: [] };
    const risk = { score: 82, factors: [{ label: 'amount anomaly', points: 30 }] };
    const drift = {
      detected: true,
      driftScore: 65,
      amountDeviationRatio: 4.5,
      frequencyDeviationRatio: 1,
      isNewDestination: false,
      isNewProtocol: false,
      recentFailureRate: 0,
      retryCount: 0,
      reasons: ['Amount spike'],
    };
    const trust = 40;

    const result = determineAuthority(sampleAction, profile, policy, risk, drift, trust);
    expect(result.authorityLevel).toBe(AuthorityLevel.APPROVAL_REQUIRED);
    expect(result.requiresApproval).toBe(true);
    expect(result.allowed).toBe(false);
  });

  it('restricts authority (Level 3) for unfamiliar destinations and moderate drift', () => {
    const policy = { passed: true, violations: [] };
    const risk = { score: 60, factors: [{ label: 'new destination', points: 20 }] };
    const drift = {
      detected: true,
      driftScore: 45,
      amountDeviationRatio: 1.5,
      frequencyDeviationRatio: 1,
      isNewDestination: true,
      isNewProtocol: false,
      recentFailureRate: 0,
      retryCount: 0,
      reasons: ['New destination'],
    };
    const trust = 65;

    const result = determineAuthority(sampleAction, profile, policy, risk, drift, trust);
    expect(result.authorityLevel).toBe(AuthorityLevel.RESTRICTED);
    expect(result.allowed).toBe(true);
    expect(result.requiresApproval).toBe(false);
  });
});
