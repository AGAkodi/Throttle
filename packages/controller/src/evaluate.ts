/**
 * Core Evaluation Pipeline
 * Deterministic, reproducible entrypoint connecting Layers 1 -> 5.
 * ZERO LLM calls: pure function mapping (ProposedAction, AgentProfile) -> Decision.
 */

import { ProposedAction, AgentProfile, Decision } from './types.js';
import { evaluatePolicy } from './engines/policy-engine.js';
import { evaluateRisk } from './engines/risk-engine.js';
import { detectDrift } from './engines/drift-detector.js';
import { evaluateTrust } from './engines/trust-engine.js';
import { determineAuthority } from './engines/authority-engine.js';

export interface EvaluationResult {
  decision: Decision;
  updatedProfile: AgentProfile;
}

/**
 * Pure evaluation function: given an action and an agent profile, produces a deterministic Decision.
 */
export function evaluate(action: ProposedAction, profile: AgentProfile): Decision {
  // Layer 1: Policy Engine
  const policyEval = evaluatePolicy(action, profile);

  // Layer 2: Risk Engine
  const riskAssessment = evaluateRisk(action, profile);

  // Layer 3: Drift Detector
  const driftSignals = detectDrift(action, profile);

  // Layer 4: Trust Engine
  const trustResult = evaluateTrust(action, profile, policyEval, driftSignals);

  // Layer 5: Authority Engine
  const authorityDecision = determineAuthority(
    action,
    profile,
    policyEval,
    riskAssessment,
    driftSignals,
    trustResult.updatedScore.current
  );

  const decision: Decision = {
    id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    actionId: action.id,
    agentId: action.agentId,
    timestamp: action.timestamp || Date.now(),
    allowed: authorityDecision.allowed,
    requiresApproval: authorityDecision.requiresApproval,
    isFrozen: authorityDecision.isFrozen,
    authorityLevel: authorityDecision.authorityLevel,
    previousAuthorityLevel: authorityDecision.previousAuthorityLevel,
    levelChanged: authorityDecision.levelChanged,
    reason: authorityDecision.reason,
    policyEvaluation: policyEval,
    riskAssessment,
    driftSignals,
    trustScore: trustResult.updatedScore.current,
  };

  return decision;
}

/**
 * Evaluates an action and updates the agent profile metrics and authority state.
 */
export function evaluateAndUpdateProfile(action: ProposedAction, profile: AgentProfile): EvaluationResult {
  // Layer 1
  const policyEval = evaluatePolicy(action, profile);
  // Layer 2
  const riskAssessment = evaluateRisk(action, profile);
  // Layer 3
  const driftSignals = detectDrift(action, profile);
  // Layer 4
  const trustResult = evaluateTrust(action, profile, policyEval, driftSignals);
  // Layer 5
  const authorityDecision = determineAuthority(
    action,
    profile,
    policyEval,
    riskAssessment,
    driftSignals,
    trustResult.updatedScore.current
  );

  const decision: Decision = {
    id: `dec_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
    actionId: action.id,
    agentId: action.agentId,
    timestamp: action.timestamp || Date.now(),
    allowed: authorityDecision.allowed,
    requiresApproval: authorityDecision.requiresApproval,
    isFrozen: authorityDecision.isFrozen,
    authorityLevel: authorityDecision.authorityLevel,
    previousAuthorityLevel: authorityDecision.previousAuthorityLevel,
    levelChanged: authorityDecision.levelChanged,
    reason: authorityDecision.reason,
    policyEvaluation: policyEval,
    riskAssessment,
    driftSignals,
    trustScore: trustResult.updatedScore.current,
  };

  const now = action.timestamp || Date.now();
  const isSuccess = decision.allowed;

  // Clone and update profile state
  const updatedProfile: AgentProfile = {
    ...profile,
    currentAuthorityLevel: decision.authorityLevel,
    trustScore: trustResult.updatedScore,
    metrics: {
      ...profile.metrics,
      totalActions: profile.metrics.totalActions + 1,
      successfulActions: isSuccess ? profile.metrics.successfulActions + 1 : profile.metrics.successfulActions,
      failedActions: !isSuccess ? profile.metrics.failedActions + 1 : profile.metrics.failedActions,
      consecutiveSuccessfulActions: isSuccess ? profile.metrics.consecutiveSuccessfulActions + 1 : 0,
      hourlySpendUsd: isSuccess ? profile.metrics.hourlySpendUsd + action.amountUsd : profile.metrics.hourlySpendUsd,
      dailySpendUsd: isSuccess ? profile.metrics.dailySpendUsd + action.amountUsd : profile.metrics.dailySpendUsd,
      lastActionTimestamp: now,
      recentRetries: driftSignals.retryCount,
    },
    updatedAt: now,
  };

  return {
    decision,
    updatedProfile,
  };
}
