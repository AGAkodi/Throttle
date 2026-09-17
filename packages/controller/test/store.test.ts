import { describe, it, expect } from 'vitest';
import { ThrottleStore } from '../src/state/store.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { createActionRecord } from '../src/state/action-record.js';
import { AuthorityLevel, ProposedAction, Decision } from '../src/types.js';

describe('Throttle SQLite Store', () => {
  it('initializes in-memory database and persists AgentProfile', () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-test-store', 'StoreAgent');

    store.saveAgent(profile);
    const retrieved = store.getAgent('agent-test-store');
    expect(retrieved).not.toBeNull();
    expect(retrieved?.name).toBe('StoreAgent');
    expect(retrieved?.currentAuthorityLevel).toBe(AuthorityLevel.FULL_AUTONOMY);
    store.close();
  });

  it('persists ActionRecord with distinct authority level and queries it', () => {
    const store = new ThrottleStore(':memory:');
    const action: ProposedAction = {
      id: 'act-store-1',
      agentId: 'agent-test-store',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0x123',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    };

    const decision: Decision = {
      id: 'dec-store-1',
      actionId: action.id,
      agentId: action.agentId,
      timestamp: action.timestamp,
      allowed: true,
      requiresApproval: false,
      isFrozen: false,
      authorityLevel: AuthorityLevel.LOGGED_AUTONOMY, // Distinct Level 1
      previousAuthorityLevel: AuthorityLevel.FULL_AUTONOMY,
      levelChanged: true,
      reason: 'Logged autonomy audit',
      policyEvaluation: { passed: true, violations: [] },
      riskAssessment: { score: 18, factors: [] },
      driftSignals: {
        detected: false,
        driftScore: 0,
        amountDeviationRatio: 1,
        frequencyDeviationRatio: 1,
        isNewDestination: false,
        isNewProtocol: false,
        recentFailureRate: 0,
        retryCount: 0,
        reasons: [],
      },
      trustScore: 82,
    };

    const record = createActionRecord(action, decision, 'executed', '0xmocktxhash');
    store.saveActionRecord(record);

    const history = store.getActionRecords('agent-test-store', 10);
    expect(history).toHaveLength(1);
    expect(history[0].authorityLevel).toBe(AuthorityLevel.LOGGED_AUTONOMY);
    expect(history[0].executionTxHash).toBe('0xmocktxhash');
    store.close();
  });

  it('records authority transition events', () => {
    const store = new ThrottleStore(':memory:');
    store.recordAuthorityEvent({
      agentId: 'agent-test-store',
      fromLevel: AuthorityLevel.FULL_AUTONOMY,
      toLevel: AuthorityLevel.APPROVAL_REQUIRED,
      reason: 'Spike in risk detected',
      timestamp: Date.now(),
    });

    const events = store.getAuthorityEvents('agent-test-store');
    expect(events).toHaveLength(1);
    expect(events[0].fromLevel).toBe(AuthorityLevel.FULL_AUTONOMY);
    expect(events[0].toLevel).toBe(AuthorityLevel.APPROVAL_REQUIRED);
    store.close();
  });

  it('persists Level 4 actions as pending with strictly no fabricated execution txHash', () => {
    const store = new ThrottleStore(':memory:');
    const action: ProposedAction = {
      id: 'act-store-level4',
      agentId: 'agent-test-store',
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0x123',
      amount: '50000000',
      amountUsd: 50.0,
      tokenSymbol: 'USDC',
    };

    const decision: Decision = {
      id: 'dec-store-level4',
      actionId: action.id,
      agentId: action.agentId,
      timestamp: action.timestamp,
      allowed: false,
      requiresApproval: true,
      isFrozen: false,
      authorityLevel: AuthorityLevel.APPROVAL_REQUIRED,
      previousAuthorityLevel: AuthorityLevel.RESTRICTED,
      levelChanged: true,
      reason: 'Held at Level 4 for human approval',
      policyEvaluation: { passed: true, violations: [] },
      riskAssessment: { score: 75, factors: [] },
      driftSignals: {
        detected: true,
        driftScore: 70,
        amountDeviationRatio: 5,
        frequencyDeviationRatio: 1,
        isNewDestination: false,
        isNewProtocol: false,
        recentFailureRate: 0,
        retryCount: 0,
        reasons: ['Amount surge'],
      },
      trustScore: 40,
    };

    // Level 4 action must be created with pending status and undefined executionTxHash
    const record = createActionRecord(action, decision, 'pending');
    expect(record.executionStatus).toBe('pending');
    expect(record.executionTxHash).toBeUndefined();

    store.saveActionRecord(record);

    const history = store.getActionRecords('agent-test-store', 10);
    expect(history).toHaveLength(1);
    expect(history[0].executionStatus).toBe('pending');
    expect(history[0].executionTxHash).toBeUndefined();
    expect(history[0].authorityLevel).toBe(AuthorityLevel.APPROVAL_REQUIRED);
    store.close();
  });
});
