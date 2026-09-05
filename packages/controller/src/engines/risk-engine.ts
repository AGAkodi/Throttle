/**
 * Layer 2: Risk Engine
 * Scores a proposed action 0-100 and produces a labeled factor breakdown.
 * Evaluates amount anomalies, unfamiliar destinations/protocols, frequency spikes, and failure history.
 */

import { ProposedAction, AgentProfile, RiskAssessment, RiskFactor } from '../types.js';

export function evaluateRisk(action: ProposedAction, profile: AgentProfile): RiskAssessment {
  const factors: RiskFactor[] = [];
  const baseline = profile.baseline;
  const metrics = profile.metrics;
  const constraints = profile.policyConstraints;

  // 1. Amount Anomaly Factor
  if (baseline.isEstablished && baseline.meanAmountUsd > 0) {
    const ratio = action.amountUsd / baseline.meanAmountUsd;
    if (ratio >= 5.0) {
      factors.push({
        label: 'amount anomaly',
        points: 30,
        description: `Action amount $${action.amountUsd.toFixed(2)} is ${ratio.toFixed(1)}x higher than baseline average ($${baseline.meanAmountUsd.toFixed(2)})`,
      });
    } else if (ratio >= 3.0) {
      factors.push({
        label: 'amount anomaly',
        points: 20,
        description: `Action amount $${action.amountUsd.toFixed(2)} is ${ratio.toFixed(1)}x higher than baseline average`,
      });
    } else if (ratio >= 1.75) {
      factors.push({
        label: 'amount anomaly',
        points: 10,
        description: `Action amount $${action.amountUsd.toFixed(2)} moderately exceeds baseline average`,
      });
    }
  } else if (constraints.maxSingleTransferUsd > 0) {
    // Fallback if baseline is not yet established: proximity to maximum policy limit
    const policyFraction = action.amountUsd / constraints.maxSingleTransferUsd;
    if (policyFraction >= 0.8) {
      factors.push({
        label: 'amount anomaly',
        points: 25,
        description: `Action amount is ${Math.round(policyFraction * 100)}% of the absolute maximum transfer limit`,
      });
    } else if (policyFraction >= 0.5) {
      factors.push({
        label: 'amount anomaly',
        points: 12,
        description: `Action amount is ${Math.round(policyFraction * 100)}% of maximum single transfer limit`,
      });
    }
  }

  // 2. New Destination Factor
  if (baseline.isEstablished) {
    const isKnown = baseline.knownDestinations.some(
      (d) => d.toLowerCase() === action.destination.toLowerCase()
    );
    if (!isKnown) {
      factors.push({
        label: 'new destination',
        points: 20,
        description: `Destination '${action.destination}' is not present in established agent baseline history`,
      });
    }
  }

  // 3. New Protocol Factor
  if (baseline.isEstablished) {
    const isKnown = baseline.knownProtocols.some(
      (p) => p.toLowerCase() === action.protocol.toLowerCase()
    );
    if (!isKnown) {
      factors.push({
        label: 'new protocol',
        points: 15,
        description: `Protocol '${action.protocol}' has not been previously observed for this agent`,
      });
    }
  }

  // 4. Frequency Anomaly Factor
  if (baseline.isEstablished && baseline.typicalActionsPerHour > 0) {
    // Estimate current frequency from recent action window
    const now = action.timestamp || Date.now();
    const windowHours = Math.max(0.25, (now - metrics.windowStartTimestamp) / 3600000);
    const currentActionsPerHour = metrics.totalActions / windowHours;
    const freqRatio = currentActionsPerHour / baseline.typicalActionsPerHour;

    if (freqRatio >= 3.0) {
      factors.push({
        label: 'frequency anomaly',
        points: 15,
        description: `Action rate of ${currentActionsPerHour.toFixed(1)}/hr is ${freqRatio.toFixed(1)}x typical baseline rate (${baseline.typicalActionsPerHour.toFixed(1)}/hr)`,
      });
    } else if (freqRatio >= 1.8) {
      factors.push({
        label: 'frequency anomaly',
        points: 10,
        description: `Action rate is elevated (${freqRatio.toFixed(1)}x baseline)`,
      });
    }
  }

  // 5. Recent Failures Factor
  const totalRecent = metrics.successfulActions + metrics.failedActions;
  if (totalRecent > 0) {
    const failureRate = metrics.failedActions / totalRecent;
    if (failureRate >= 0.5) {
      factors.push({
        label: 'recent failures',
        points: 20,
        description: `High recent failure rate (${Math.round(failureRate * 100)}% of last ${totalRecent} actions failed)`,
      });
    } else if (failureRate >= 0.25) {
      factors.push({
        label: 'recent failures',
        points: 10,
        description: `Elevated failure rate (${Math.round(failureRate * 100)}% failures)`,
      });
    }
  }

  // 6. Recent Retries Factor
  if (metrics.recentRetries >= 4) {
    factors.push({
      label: 'retry spike',
      points: 15,
      description: `Agent has experienced ${metrics.recentRetries} rapid retries`,
    });
  } else if (metrics.recentRetries >= 2) {
    factors.push({
      label: 'retry spike',
      points: 8,
      description: `Multiple repeated retries detected (${metrics.recentRetries})`,
    });
  }

  const rawSum = factors.reduce((sum, f) => sum + f.points, 0);
  const score = Math.min(100, Math.max(0, rawSum));

  return {
    score,
    factors,
  };
}
