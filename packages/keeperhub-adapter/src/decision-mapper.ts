/**
 * Decision Mapper
 * Maps Throttle's 6-level Authority hierarchy to:
 * 1. Coarse Hook Decisions ({ decision: 'allow' | 'ask' | 'deny' })
 * 2. Fine-Grained Sign-Gate Decisions ({ action: 'proceed' | 'hold' | 'reject' })
 * Preserves the rich, distinct AuthorityLevel in all logged metadata.
 */

import { AuthorityLevel, Decision } from '@throttle/controller';

export interface PreToolUseHookDecision {
  decision: 'allow' | 'ask' | 'deny';
  reason?: string;
  metadata: {
    authorityLevel: AuthorityLevel;
    authorityLevelName: string;
    riskScore: number;
    trustScore: number;
    driftDetected: boolean;
  };
}

export interface SignGateDecision {
  action: 'proceed' | 'hold' | 'reject';
  reason?: string;
  metadata: {
    authorityLevel: AuthorityLevel;
    authorityLevelName: string;
    riskScore: number;
    trustScore: number;
    driftDetected: boolean;
    factors: Array<{ label: string; points: number }>;
  };
}

export function getAuthorityLevelName(level: AuthorityLevel): string {
  switch (level) {
    case AuthorityLevel.FULL_AUTONOMY:
      return 'Level 0: Full Autonomy';
    case AuthorityLevel.LOGGED_AUTONOMY:
      return 'Level 1: Logged Autonomy';
    case AuthorityLevel.ENHANCED_MONITORING:
      return 'Level 2: Enhanced Monitoring';
    case AuthorityLevel.RESTRICTED:
      return 'Level 3: Restricted Scope';
    case AuthorityLevel.APPROVAL_REQUIRED:
      return 'Level 4: Approval Required';
    case AuthorityLevel.FROZEN:
      return 'Level 5: Frozen (Denied)';
    default:
      return `Level ${level}`;
  }
}

/**
 * Maps a Controller Decision to a Claude PreToolUse Hook Decision (Gate 1).
 */
export function mapToHookDecision(decision: Decision): PreToolUseHookDecision {
  const metadata = {
    authorityLevel: decision.authorityLevel,
    authorityLevelName: getAuthorityLevelName(decision.authorityLevel),
    riskScore: decision.riskAssessment.score,
    trustScore: decision.trustScore,
    driftDetected: decision.driftSignals.detected,
  };

  if (decision.isFrozen) {
    return { decision: 'deny', reason: decision.reason, metadata };
  }

  if (decision.requiresApproval) {
    return { decision: 'ask', reason: decision.reason, metadata };
  }

  // Levels 0, 1, 2, and compliant 3 allow execution to continue to Gate 2
  return { decision: 'allow', reason: decision.reason, metadata };
}

/**
 * Maps a Controller Decision to a Sign-Gate Decision (Gate 2 - Real Payment Signer).
 */
export function mapToSignGateDecision(decision: Decision): SignGateDecision {
  const metadata = {
    authorityLevel: decision.authorityLevel,
    authorityLevelName: getAuthorityLevelName(decision.authorityLevel),
    riskScore: decision.riskAssessment.score,
    trustScore: decision.trustScore,
    driftDetected: decision.driftSignals.detected,
    factors: decision.riskAssessment.factors,
  };

  if (decision.isFrozen) {
    return { action: 'reject', reason: decision.reason, metadata };
  }

  if (decision.requiresApproval) {
    return { action: 'hold', reason: decision.reason, metadata };
  }

  return { action: 'proceed', reason: decision.reason, metadata };
}
