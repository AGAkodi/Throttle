/**
 * Layer 4: Trust Engine
 * Formal weighted trust model with exponential time-decay.
 * Not a simple success counter: protects against slow-drift and aggressive spamming.
 */

import { AgentProfile, PolicyEvaluation, DriftSignals, ProposedAction, TrustScore } from '../types.js';

export interface TrustUpdateResult {
  updatedScore: TrustScore;
  delta: number;
  reason: string;
}

const DEFAULT_HALF_LIFE_MS = 24 * 60 * 60 * 1000; // 24 hours half-life
const NEUTRAL_TRUST_BASELINE = 50; // Inactivity decays towards neutral

export function calculateTrustDecay(trustScore: TrustScore, currentTime: number): number {
  const elapsedMs = Math.max(0, currentTime - trustScore.lastUpdated);
  const halfLife = trustScore.halfLifeMs || DEFAULT_HALF_LIFE_MS;

  if (elapsedMs <= 0 || halfLife <= 0) {
    return trustScore.current;
  }

  // Exponential decay towards neutral baseline:
  // S(t) = Baseline + (S(0) - Baseline) * 0.5^(t / halfLife)
  const decayFactor = Math.pow(0.5, elapsedMs / halfLife);
  const decayed = NEUTRAL_TRUST_BASELINE + (trustScore.current - NEUTRAL_TRUST_BASELINE) * decayFactor;

  return Math.round(decayed * 10) / 10;
}

export function evaluateTrust(
  action: ProposedAction,
  profile: AgentProfile,
  policyEval: PolicyEvaluation,
  driftSignals: DriftSignals
): TrustUpdateResult {
  const now = action.timestamp || Date.now();
  const decayedScore = calculateTrustDecay(profile.trustScore, now);

  let delta = 0;
  const reasons: string[] = [];

  // 1. Policy Violation (Critical Penalty)
  if (!policyEval.passed) {
    delta -= 30;
    reasons.push(`Policy violation (-30): ${policyEval.violations.join('; ')}`);
  }

  // 2. Behavioral Drift (Severe Penalty)
  if (driftSignals.detected) {
    const penalty = Math.min(25, Math.max(10, Math.round(driftSignals.driftScore * 0.25)));
    delta -= penalty;
    reasons.push(`Behavioral drift detected (-${penalty})`);
  }

  // 3. New Destination Penalty
  if (driftSignals.isNewDestination) {
    delta -= 8;
    reasons.push('Unfamiliar target destination (-8)');
  }

  // 4. Repeated Retries Penalty
  if (driftSignals.retryCount >= 3) {
    delta -= 10;
    reasons.push(`Successive retry loop (-10)`);
  } else if (driftSignals.retryCount > 0) {
    delta -= 3;
    reasons.push('Action retry recorded (-3)');
  }

  // 5. Positive trust accrual for clean, normal-range operations
  if (policyEval.passed && !driftSignals.detected && !driftSignals.isNewDestination) {
    const isRecovery = profile.currentAuthorityLevel >= 3; // Recovering from restricted/approval state
    const normalAmount = profile.baseline.isEstablished
      ? action.amountUsd <= profile.baseline.meanAmountUsd * 1.5
      : action.amountUsd <= profile.policyConstraints.maxSingleTransferUsd * 0.5;

    if (normalAmount) {
      if (isRecovery) {
        delta += 3.0; // Faster recovery bonus during rehabilitation
        reasons.push('Rehabilitation normal-range action (+3.0)');
      } else {
        delta += 1.5; // Steady earned trust
        reasons.push('Consistent normal-range execution (+1.5)');
      }

      // Sustained stability bonus
      if (profile.metrics.consecutiveSuccessfulActions >= 10) {
        delta += 0.5;
        reasons.push('Sustained clean execution streak (+0.5)');
      }
    }
  }

  const rawNewScore = decayedScore + delta;
  const clampedScore = Math.min(100, Math.max(0, Math.round(rawNewScore * 10) / 10));
  const finalDelta = Math.round((clampedScore - profile.trustScore.current) * 10) / 10;
  const reasonText = reasons.length > 0 ? reasons.join('; ') : 'No trust score change';

  const updatedHistory = [
    ...(profile.trustScore.history || []).slice(-49), // retain last 50 events
    {
      timestamp: now,
      score: clampedScore,
      delta: finalDelta,
      reason: reasonText,
    },
  ];

  return {
    updatedScore: {
      current: clampedScore,
      halfLifeMs: profile.trustScore.halfLifeMs || DEFAULT_HALF_LIFE_MS,
      lastUpdated: now,
      history: updatedHistory,
    },
    delta: finalDelta,
    reason: reasonText,
  };
}
