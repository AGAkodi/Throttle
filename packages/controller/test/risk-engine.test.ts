import { describe, it, expect } from 'vitest';
import { evaluateRisk } from '../src/engines/risk-engine.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { ProposedAction } from '../src/types.js';

describe('Layer 2: Risk Engine', () => {
  const profileWithBaseline = {
    ...createDefaultProfile('agent-1', 'TestAgent'),
    baseline: {
      isEstablished: true,
      sampleSize: 20,
      meanAmountUsd: 2.0,
      stdDevAmountUsd: 0.5,
      typicalActionsPerHour: 10,
      knownDestinations: ['0xknown1', '0xknown2'],
      knownProtocols: ['taskmarket'],
      typicalRetryRate: 0.05,
    },
  };

  it('scores normal-range action with very low risk and zero factor penalties', () => {
    const action: ProposedAction = {
      id: 'act-1',
      agentId: 'agent-1',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xknown1',
      amount: '2000000',
      amountUsd: 2.0,
      tokenSymbol: 'USDC',
    };

    const risk = evaluateRisk(action, profileWithBaseline);
    expect(risk.score).toBe(0);
    expect(risk.factors).toHaveLength(0);
  });

  it('detects and labels amount anomaly when spend is 5x baseline', () => {
    const action: ProposedAction = {
      id: 'act-2',
      agentId: 'agent-1',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xknown1',
      amount: '12000000',
      amountUsd: 12.0, // 6x baseline mean of 2.0
      tokenSymbol: 'USDC',
    };

    const risk = evaluateRisk(action, profileWithBaseline);
    expect(risk.score).toBeGreaterThanOrEqual(30);
    const amountFactor = risk.factors.find((f) => f.label === 'amount anomaly');
    expect(amountFactor).toBeDefined();
    expect(amountFactor?.points).toBe(30);
  });

  it('detects and labels new destination', () => {
    const action: ProposedAction = {
      id: 'act-3',
      agentId: 'agent-1',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xunseen_destination',
      amount: '2000000',
      amountUsd: 2.0,
      tokenSymbol: 'USDC',
    };

    const risk = evaluateRisk(action, profileWithBaseline);
    expect(risk.score).toBeGreaterThanOrEqual(20);
    const destFactor = risk.factors.find((f) => f.label === 'new destination');
    expect(destFactor).toBeDefined();
    expect(destFactor?.points).toBe(20);
  });

  it('aggregates multiple labeled risk factors when an action combines anomalies', () => {
    const anomalousAction: ProposedAction = {
      id: 'act-4',
      agentId: 'agent-1',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'new_unknown_dex',
      destination: '0xunseen_destination',
      amount: '15000000',
      amountUsd: 15.0,
      tokenSymbol: 'USDC',
    };

    const risk = evaluateRisk(anomalousAction, profileWithBaseline);
    // 30 (amount) + 20 (destination) + 15 (protocol) = 65
    expect(risk.score).toBeGreaterThanOrEqual(65);
    const labels = risk.factors.map((f) => f.label);
    expect(labels).toContain('amount anomaly');
    expect(labels).toContain('new destination');
    expect(labels).toContain('new protocol');
  });
});
