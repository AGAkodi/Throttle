/**
 * Layer 3: Drift Detector
 * Builds an operational baseline (typical tx size, actions/hour, known protocols/destinations, retry rate)
 * and detects behavioral divergence over time.
 */

import { ProposedAction, AgentProfile, DriftSignals, AgentBaseline } from '../types.js';

export function detectDrift(action: ProposedAction, profile: AgentProfile): DriftSignals {
  const baseline = profile.baseline;
  const metrics = profile.metrics;
  const reasons: string[] = [];

  // If baseline is not yet established, drift cannot be determined reliably
  if (!baseline.isEstablished) {
    return {
      detected: false,
      driftScore: 0,
      amountDeviationRatio: 1.0,
      frequencyDeviationRatio: 1.0,
      isNewDestination: false,
      isNewProtocol: false,
      recentFailureRate: 0,
      retryCount: metrics.recentRetries || 0,
      reasons: ['Baseline data collection in progress (insufficient samples)'],
    };
  }

  let driftScore = 0;

  // 1. Amount Deviation
  const amountRatio = baseline.meanAmountUsd > 0 ? action.amountUsd / baseline.meanAmountUsd : 1.0;
  if (amountRatio >= 4.0) {
    driftScore += 30;
    reasons.push(`Spend volume deviation: ${amountRatio.toFixed(1)}x baseline mean ($${action.amountUsd.toFixed(2)} vs $${baseline.meanAmountUsd.toFixed(2)})`);
  } else if (amountRatio >= 2.5) {
    driftScore += 18;
    reasons.push(`Moderate spend volume deviation: ${amountRatio.toFixed(1)}x baseline mean`);
  }

  // 2. Destination Drift
  const isNewDestination = !baseline.knownDestinations.some(
    (d) => d.toLowerCase() === action.destination.toLowerCase()
  );
  if (isNewDestination) {
    driftScore += 25;
    reasons.push(`Unfamiliar destination drift: address '${action.destination}' is outside baseline history`);
  }

  // 3. Protocol Drift
  const isNewProtocol = !baseline.knownProtocols.some(
    (p) => p.toLowerCase() === action.protocol.toLowerCase()
  );
  if (isNewProtocol) {
    driftScore += 20;
    reasons.push(`Protocol drift: interaction with unobserved protocol '${action.protocol}'`);
  }

  // 4. Frequency Drift
  const now = action.timestamp || Date.now();
  const windowHours = Math.max(0.25, (now - metrics.windowStartTimestamp) / 3600000);
  const currentActionsPerHour = metrics.totalActions / windowHours;
  const freqRatio = baseline.typicalActionsPerHour > 0 ? currentActionsPerHour / baseline.typicalActionsPerHour : 1.0;

  if (freqRatio >= 3.0) {
    driftScore += 20;
    reasons.push(`Velocity drift: current pace of ${currentActionsPerHour.toFixed(1)} actions/hr is ${freqRatio.toFixed(1)}x baseline velocity`);
  } else if (freqRatio >= 2.0) {
    driftScore += 10;
    reasons.push(`Elevated velocity: ${freqRatio.toFixed(1)}x baseline rate`);
  }

  // 5. Failure / Retry Drift
  const totalRecent = metrics.successfulActions + metrics.failedActions;
  const recentFailureRate = totalRecent > 0 ? metrics.failedActions / totalRecent : 0;
  if (recentFailureRate >= 0.4) {
    driftScore += 20;
    reasons.push(`Reliability degradation: ${Math.round(recentFailureRate * 100)}% failure rate observed`);
  }

  if (metrics.recentRetries >= 3) {
    driftScore += 15;
    reasons.push(`Abnormal retry pattern: ${metrics.recentRetries} rapid successive retries`);
  }

  const boundedScore = Math.min(100, driftScore);
  const detected = boundedScore >= 35;

  return {
    detected,
    driftScore: boundedScore,
    amountDeviationRatio: amountRatio,
    frequencyDeviationRatio: freqRatio,
    isNewDestination,
    isNewProtocol,
    recentFailureRate,
    retryCount: metrics.recentRetries || 0,
    reasons,
  };
}

/**
 * Recalculates an agent's behavioral baseline from an array of normal-operation actions.
 */
export function calculateBaseline(actions: ProposedAction[], typicalActionsPerHour = 10): AgentBaseline {
  if (actions.length === 0) {
    return {
      isEstablished: false,
      sampleSize: 0,
      meanAmountUsd: 0,
      stdDevAmountUsd: 0,
      typicalActionsPerHour,
      knownDestinations: [],
      knownProtocols: [],
      typicalRetryRate: 0,
    };
  }

  const amounts = actions.map((a) => a.amountUsd);
  const sum = amounts.reduce((acc, val) => acc + val, 0);
  const mean = sum / amounts.length;

  const variance = amounts.reduce((acc, val) => acc + Math.pow(val - mean, 2), 0) / amounts.length;
  const stdDev = Math.sqrt(variance);

  const destinations = Array.from(new Set(actions.map((a) => a.destination.toLowerCase())));
  const protocols = Array.from(new Set(actions.map((a) => a.protocol.toLowerCase())));

  return {
    isEstablished: actions.length >= 5, // minimum 5 actions to establish initial baseline
    sampleSize: actions.length,
    meanAmountUsd: mean,
    stdDevAmountUsd: stdDev,
    typicalActionsPerHour,
    knownDestinations: destinations,
    knownProtocols: protocols,
    typicalRetryRate: 0.05,
    establishedAt: Date.now(),
  };
}
