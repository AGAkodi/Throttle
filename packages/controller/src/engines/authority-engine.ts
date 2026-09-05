/**
 * Layer 5: Authority Engine
 * Synthesizes policy evaluation, risk factors, drift signals, and trust score
 * into one of the six distinct AuthorityLevels with human-readable rationale.
 */

import {
  AuthorityLevel,
  PolicyEvaluation,
  RiskAssessment,
  DriftSignals,
  AgentProfile,
  ProposedAction,
} from '../types.js';

export interface AuthorityDecision {
  authorityLevel: AuthorityLevel;
  previousAuthorityLevel: AuthorityLevel;
  levelChanged: boolean;
  allowed: boolean;
  requiresApproval: boolean;
  isFrozen: boolean;
  reason: string;
}

export function determineAuthority(
  action: ProposedAction,
  profile: AgentProfile,
  policyEval: PolicyEvaluation,
  riskAssessment: RiskAssessment,
  driftSignals: DriftSignals,
  evaluatedTrustScore: number
): AuthorityDecision {
  const prevLevel = profile.currentAuthorityLevel;
  let targetLevel: AuthorityLevel;
  const reasons: string[] = [];

  // 1. HARD POLICY FAILURES -> Instant FREEZE (Level 5)
  if (!policyEval.passed) {
    targetLevel = AuthorityLevel.FROZEN;
    reasons.push(`Policy violation: ${policyEval.violations.join('; ')}`);
  }
  // 2. CRITICAL RISK OR ZERO TRUST -> FREEZE (Level 5)
  else if (riskAssessment.score >= 90 || evaluatedTrustScore <= 15) {
    targetLevel = AuthorityLevel.FROZEN;
    reasons.push(
      `Critical hazard detected: Risk score ${riskAssessment.score}/100, Trust ${evaluatedTrustScore.toFixed(1)}/100`
    );
  }
  // 3. HIGH RISK OR LOW TRUST OR SEVERE DRIFT -> APPROVAL REQUIRED (Level 4)
  else if (
    riskAssessment.score >= 75 ||
    evaluatedTrustScore < 30 ||
    driftSignals.driftScore >= 60 ||
    (driftSignals.amountDeviationRatio >= 4.0 && riskAssessment.score >= 50)
  ) {
    targetLevel = AuthorityLevel.APPROVAL_REQUIRED;
    reasons.push(
      `Action requires human approval: Elevated risk (${riskAssessment.score}/100) or behavioral drift (${driftSignals.driftScore}/100)`
    );
  }
  // 4. MODERATE-HIGH RISK OR MODERATE DRIFT -> RESTRICTED (Level 3)
  else if (
    riskAssessment.score >= 55 ||
    evaluatedTrustScore < 45 ||
    driftSignals.detected ||
    driftSignals.isNewDestination
  ) {
    targetLevel = AuthorityLevel.RESTRICTED;
    reasons.push(
      `Restricted authority applied: Moderate risk (${riskAssessment.score}/100), new destination or observed drift`
    );
  }
  // 5. MODERATE RISK OR ELEVATED RE-EVALUATION -> ENHANCED MONITORING (Level 2)
  else if (
    riskAssessment.score >= 35 ||
    evaluatedTrustScore < 60 ||
    metricsShowInstability(profile)
  ) {
    targetLevel = AuthorityLevel.ENHANCED_MONITORING;
    reasons.push(
      `Enhanced monitoring mode: Risk score ${riskAssessment.score}/100, frequent re-evaluation active`
    );
  }
  // 6. LOW RISK & MODERATE-HIGH TRUST -> LOGGED AUTONOMY (Level 1)
  else if (riskAssessment.score >= 15 || evaluatedTrustScore < 80) {
    targetLevel = AuthorityLevel.LOGGED_AUTONOMY;
    reasons.push(
      `Logged autonomy: Normal execution with detailed audit logging active (Trust: ${evaluatedTrustScore.toFixed(1)}/100)`
    );
  }
  // 7. LOW RISK, HIGH TRUST, CLEAN BASELINE -> FULL AUTONOMY (Level 0)
  else {
    targetLevel = AuthorityLevel.FULL_AUTONOMY;
    reasons.push(
      `Full autonomy: Operational parameters optimal (Trust: ${evaluatedTrustScore.toFixed(1)}/100, Risk: ${riskAssessment.score}/100)`
    );
  }

  // Handle Rehabilitation / Recovery Step-Down:
  // If an agent was restricted/approval-required, and has executed multiple clean consecutive actions,
  // ensure gradual restoration (e.g. cannot leap from Level 4 directly to Level 0).
  if (prevLevel > targetLevel) {
    // Stepping down authority level (recovering)
    const maxStepDown = 1; // maximum 1 level improvement per action evaluation cycle
    if (prevLevel - targetLevel > maxStepDown) {
      targetLevel = (prevLevel - maxStepDown) as AuthorityLevel;
      reasons.push(`Gradual recovery progression: Step-down from Level ${prevLevel} to Level ${targetLevel}`);
    }
  }

  const levelChanged = targetLevel !== prevLevel;
  const isFrozen = targetLevel === AuthorityLevel.FROZEN;
  const requiresApproval = targetLevel === AuthorityLevel.APPROVAL_REQUIRED;
  const allowed = !isFrozen && !requiresApproval;

  return {
    authorityLevel: targetLevel,
    previousAuthorityLevel: prevLevel,
    levelChanged,
    allowed,
    requiresApproval,
    isFrozen,
    reason: reasons.join(' | '),
  };
}

function metricsShowInstability(profile: AgentProfile): boolean {
  return (
    profile.metrics.recentRetries > 1 ||
    (profile.metrics.failedActions > 0 &&
      profile.metrics.failedActions / (profile.metrics.totalActions || 1) > 0.2)
  );
}
