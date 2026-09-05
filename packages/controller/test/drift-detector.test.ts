import { describe, it, expect } from 'vitest';
import { detectDrift, calculateBaseline } from '../src/engines/drift-detector.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { ProposedAction } from '../src/types.js';

describe('Layer 3: Drift Detector', () => {
  const sampleActions: ProposedAction[] = [1, 2, 3, 4, 5, 6].map((i) => ({
    id: `act-${i}`,
    agentId: 'agent-1',
    timestamp: Date.now() - (6 - i) * 60000,
    type: 'payment',
    chain: 'base',
    protocol: 'taskmarket',
    destination: '0xgood_worker',
    amount: '1000000',
    amountUsd: 1.0,
    tokenSymbol: 'USDC',
  }));

  it('calculates a robust baseline from historical actions', () => {
    const baseline = calculateBaseline(sampleActions);
    expect(baseline.isEstablished).toBe(true);
    expect(baseline.meanAmountUsd).toBe(1.0);
    expect(baseline.knownDestinations).toContain('0xgood_worker');
    expect(baseline.knownProtocols).toContain('taskmarket');
  });

  it('detects behavioral drift when action deviates on multiple dimensions', () => {
    const profile = {
      ...createDefaultProfile('agent-1', 'Drifter'),
      baseline: calculateBaseline(sampleActions),
    };

    const driftingAction: ProposedAction = {
      id: 'drift-1',
      agentId: 'agent-1',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'unfamiliar_dex',
      destination: '0xstrange_recipient',
      amount: '8000000',
      amountUsd: 8.0, // 8x baseline mean
      tokenSymbol: 'USDC',
    };

    const drift = detectDrift(driftingAction, profile);
    expect(drift.detected).toBe(true);
    expect(drift.driftScore).toBeGreaterThanOrEqual(50);
    expect(drift.isNewDestination).toBe(true);
    expect(drift.isNewProtocol).toBe(true);
    expect(drift.reasons.length).toBeGreaterThan(1);
  });
});
