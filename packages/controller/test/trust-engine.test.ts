import { describe, it, expect } from 'vitest';
import { evaluateTrust, calculateTrustDecay } from '../src/engines/trust-engine.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { ProposedAction } from '../src/types.js';

describe('Layer 4: Trust Engine', () => {
  const profile = createDefaultProfile('agent-1', 'TrustAgent');
  profile.trustScore.current = 80;

  const validAction: ProposedAction = {
    id: 'act-1',
    agentId: 'agent-1',
    timestamp: Date.now(),
    type: 'payment',
    chain: 'base',
    protocol: 'taskmarket',
    destination: '0xgood_target',
    amount: '1000000',
    amountUsd: 1.0,
    tokenSymbol: 'USDC',
  };

  it('heavily penalizes trust on policy violations', () => {
    const policyEval = { passed: false, violations: ['Disallowed protocol'] };
    const driftSignals = {
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

    const result = evaluateTrust(validAction, profile, policyEval, driftSignals);
    expect(result.delta).toBeLessThanOrEqual(-30);
    expect(result.updatedScore.current).toBeLessThanOrEqual(50);
  });

  it('gradually accrues trust on consistent normal actions', () => {
    const policyEval = { passed: true, violations: [] };
    const driftSignals = {
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

    const result = evaluateTrust(validAction, profile, policyEval, driftSignals);
    expect(result.delta).toBeGreaterThan(0);
    expect(result.updatedScore.current).toBeGreaterThan(80);
  });

  it('decays accumulated trust towards neutral after long inactivity', () => {
    const highTrustScore = {
      current: 90,
      halfLifeMs: 24 * 60 * 60 * 1000, // 24h
      lastUpdated: Date.now() - 48 * 60 * 60 * 1000, // 48h ago (2 half lives)
      history: [],
    };

    const decayed = calculateTrustDecay(highTrustScore, Date.now());
    // 50 + (90 - 50) * 0.25 = 60
    expect(decayed).toBeCloseTo(60, 0);
  });
});
