import { describe, it, expect } from 'vitest';
import { evaluateAndUpdateProfile, evaluate } from '../src/evaluate.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { calculateBaseline } from '../src/engines/drift-detector.js';
import { AuthorityLevel, ProposedAction } from '../src/types.js';

describe('Reliability Scenarios (TODO Phase 5 Integration Suites)', () => {
  // Scenario 1: Failure recorded, backoff, behavior metrics updated
  it('Scenario 1: Transaction failure recorded -> behavior metrics updated', () => {
    let profile = createDefaultProfile('agent-scenario-1', 'ScenarioAgent');

    // Simulate an execution failure event
    profile.metrics.failedActions += 1;
    profile.metrics.consecutiveSuccessfulActions = 0;
    profile.metrics.recentRetries += 1;

    const action: ProposedAction = {
      id: 'act-fail-1',
      agentId: profile.agentId,
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0x1234',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    };

    const { decision } = evaluateAndUpdateProfile(action, profile);
    const failureFactor = decision.riskAssessment.factors.find(
      (f) => f.label === 'recent failures' || f.label === 'retry spike'
    );
    expect(failureFactor).toBeDefined();
  });

  // Scenario 2: Repeated retries -> frequency spike -> drift detected -> authority reduced
  it('Scenario 2: Agent repeatedly retries -> drift detected -> authority reduced', () => {
    let profile = createDefaultProfile('agent-scenario-2', 'RetrySpammer');

    // Establish a baseline
    const normalActions: ProposedAction[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `base-${i}`,
      agentId: profile.agentId,
      timestamp: Date.now() - (7 - i) * 60000,
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xgood_destination',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    }));
    profile.baseline = calculateBaseline(normalActions);
    profile.currentAuthorityLevel = AuthorityLevel.FULL_AUTONOMY;

    // Simulate rapid failure loop with 4 retries
    profile.metrics.recentRetries = 4;
    profile.metrics.failedActions = 4;
    profile.metrics.successfulActions = 0;

    const retryAction: ProposedAction = {
      id: 'act-retry-spam',
      agentId: profile.agentId,
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xgood_destination',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    };

    const { decision, updatedProfile } = evaluateAndUpdateProfile(retryAction, profile);
    expect(decision.driftSignals.detected).toBe(true);
    expect(decision.authorityLevel).toBeGreaterThan(AuthorityLevel.FULL_AUTONOMY);
    expect(updatedProfile.currentAuthorityLevel).toBeGreaterThan(AuthorityLevel.FULL_AUTONOMY);
  });

  // Scenario 3: Agent requests an unknown/unfamiliar protocol or destination -> policy violation -> restricted / frozen
  it('Scenario 3: Unapproved protocol / blocked destination -> policy violation -> frozen', () => {
    const profile = createDefaultProfile('agent-scenario-3', 'PolicyViolator', {
      allowedProtocols: ['taskmarket', 'keeperhub'],
      destinationBlocklist: ['0xmalicious_contract'],
    });

    const forbiddenAction: ProposedAction = {
      id: 'act-forbidden-protocol',
      agentId: profile.agentId,
      timestamp: Date.now(),
      type: 'contract_call',
      chain: 'base',
      protocol: 'unverified_phishing_dapp',
      destination: '0xmalicious_contract',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    };

    const decision = evaluate(forbiddenAction, profile);
    expect(decision.policyEvaluation.passed).toBe(false);
    expect(decision.authorityLevel).toBe(AuthorityLevel.FROZEN);
    expect(decision.isFrozen).toBe(true);
    expect(decision.allowed).toBe(false);
    expect(decision.policyEvaluation.violations.length).toBeGreaterThanOrEqual(2);
  });

  // Scenario 4: Transaction exceeds current authority's limit -> controller rejects before sign
  it("Scenario 4: Transaction exceeds current authority's limit -> rejected before sign", () => {
    const restrictedProfile = createDefaultProfile('agent-scenario-4', 'RestrictedAgent', {
      maxSingleTransferUsd: 40.0,
      restrictedMultiplier: 0.25, // 10.0 USD limit in restricted mode
    });
    restrictedProfile.currentAuthorityLevel = AuthorityLevel.RESTRICTED;

    const oversizedAction: ProposedAction = {
      id: 'act-oversized',
      agentId: restrictedProfile.agentId,
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xgood_recipient',
      amount: '15000000',
      amountUsd: 15.0, // Exceeds 10.0 USD restricted limit
      tokenSymbol: 'USDC',
    };

    const decision = evaluate(oversizedAction, restrictedProfile);
    expect(decision.policyEvaluation.passed).toBe(false);
    expect(decision.allowed).toBe(false);
    expect(decision.policyEvaluation.violations[0]).toContain('exceeds maximum single transfer limit');
  });

  // Scenario 5: Agent returns to normal behavior over N actions -> authority gradually restored (Level 4 -> 3 -> 2 -> 1 -> 0)
  it('Scenario 5: Rehabilitation over clean actions gradually restores authority (4 -> 3 -> 2 -> 1 -> 0)', () => {
    let profile = createDefaultProfile('agent-scenario-5', 'RehabilitatingAgent');
    const normalActions: ProposedAction[] = [1, 2, 3, 4, 5, 6].map((i) => ({
      id: `norm-${i}`,
      agentId: profile.agentId,
      timestamp: Date.now() - 60000,
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xgood_worker',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    }));
    profile.baseline = calculateBaseline(normalActions);

    // Start at Level 4 (Approval Required) with depressed trust
    profile.currentAuthorityLevel = AuthorityLevel.APPROVAL_REQUIRED;
    profile.trustScore.current = 40;
    profile.metrics.recentRetries = 0;
    profile.metrics.failedActions = 0;

    const cleanActionTemplate = (index: number): ProposedAction => ({
      id: `clean-${index}`,
      agentId: profile.agentId,
      timestamp: Date.now() + index * 1000,
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0xgood_worker',
      amount: '1000000',
      amountUsd: 1.0,
      tokenSymbol: 'USDC',
    });

    const observedLevels: AuthorityLevel[] = [profile.currentAuthorityLevel];

    // Simulate 12 clean, compliant actions
    for (let i = 1; i <= 12; i++) {
      const { updatedProfile } = evaluateAndUpdateProfile(cleanActionTemplate(i), profile);
      profile = updatedProfile;
      observedLevels.push(profile.currentAuthorityLevel);
    }

    // Verify gradual downward progression towards full autonomy
    expect(observedLevels[0]).toBe(AuthorityLevel.APPROVAL_REQUIRED); // Level 4
    expect(observedLevels).toContain(AuthorityLevel.RESTRICTED); // Level 3
    expect(observedLevels).toContain(AuthorityLevel.ENHANCED_MONITORING); // Level 2
    expect(profile.currentAuthorityLevel).toBeLessThan(AuthorityLevel.RESTRICTED);
    expect(profile.trustScore.current).toBeGreaterThan(40);
  });

  // Scenario 6: Transition into Level 3 (Restricted Mode) immediately enforces the restricted spend cap
  it('Scenario 6: Level 3 transition re-evaluation rejects action exceeding restricted spend cap', () => {
    let profile = createDefaultProfile('agent-scenario-6', 'Level3TransitionAgent', {
      maxSingleTransferUsd: 40.0,
      restrictedMultiplier: 0.25, // 10.0 USD limit when in restricted mode
    });
    // Start at Level 1 (Logged Autonomy)
    profile.currentAuthorityLevel = AuthorityLevel.LOGGED;
    // Depress trust score to 40 so that authority engine targets Level 3 RESTRICTED
    profile.trustScore.current = 40;

    const transitionalAction: ProposedAction = {
      id: 'act-transitional-oversized',
      agentId: profile.agentId,
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0x1234567890123456789012345678901234567890',
      amount: '15000000',
      amountUsd: 15.0,
      tokenSymbol: 'USDC',
    };

    const { decision, updatedProfile } = evaluateAndUpdateProfile(transitionalAction, profile);
    expect(decision.authorityLevel).toBe(AuthorityLevel.RESTRICTED);
    expect(decision.levelChanged).toBe(true);
    expect(decision.allowed).toBe(false);
    expect(decision.reason).toContain('transition to Restricted Mode (Level 3) enforces restricted spend cap');
    expect(updatedProfile.currentAuthorityLevel).toBe(AuthorityLevel.RESTRICTED);
  });
});
