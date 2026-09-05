/**
 * Layer 1: Policy Engine
 * Deterministic hard constraints that can never be overridden by risk or trust scores.
 * Enforces transfer limits, allowed chains, allowed protocols, and destination lists.
 */

import { ProposedAction, AgentProfile, PolicyEvaluation, AuthorityLevel } from '../types.js';

export function evaluatePolicy(action: ProposedAction, profile: AgentProfile): PolicyEvaluation {
  const violations: string[] = [];
  const constraints = profile.policyConstraints;
  const currentLevel = profile.currentAuthorityLevel;

  // 1. Chain validation
  if (constraints.allowedChains && constraints.allowedChains.length > 0) {
    const isAllowedChain = constraints.allowedChains.some(
      (c) => c.toLowerCase() === action.chain.toLowerCase()
    );
    if (!isAllowedChain) {
      violations.push(`Chain '${action.chain}' is not permitted by policy (allowed: ${constraints.allowedChains.join(', ')})`);
    }
  }

  // 2. Protocol validation
  if (constraints.allowedProtocols && constraints.allowedProtocols.length > 0) {
    const isAllowedProtocol = constraints.allowedProtocols.some(
      (p) => p.toLowerCase() === action.protocol.toLowerCase()
    );
    if (!isAllowedProtocol) {
      violations.push(`Protocol '${action.protocol}' is not permitted by policy (allowed: ${constraints.allowedProtocols.join(', ')})`);
    }
  }

  // 3. Destination blocklist check
  if (constraints.destinationBlocklist && constraints.destinationBlocklist.length > 0) {
    const isBlocklisted = constraints.destinationBlocklist.some(
      (d) => d.toLowerCase() === action.destination.toLowerCase()
    );
    if (isBlocklisted) {
      violations.push(`Destination address '${action.destination}' is explicitly blocklisted`);
    }
  }

  // 4. Destination allowlist check (if defined and non-empty)
  if (constraints.destinationAllowlist && constraints.destinationAllowlist.length > 0) {
    const isAllowlisted = constraints.destinationAllowlist.some(
      (d) => d.toLowerCase() === action.destination.toLowerCase()
    );
    if (!isAllowlisted) {
      violations.push(`Destination address '${action.destination}' is not on the strict destination allowlist`);
    }
  }

  // 5. Single transfer spend limit (scaled down if in RESTRICTED authority mode)
  let effectiveSingleLimit = constraints.maxSingleTransferUsd;
  if (currentLevel === AuthorityLevel.RESTRICTED) {
    const multiplier = constraints.restrictedMultiplier ?? 0.25;
    effectiveSingleLimit = constraints.maxSingleTransferUsd * multiplier;
  }

  if (action.amountUsd > effectiveSingleLimit) {
    violations.push(
      `Transaction amount $${action.amountUsd.toFixed(2)} exceeds maximum single transfer limit $${effectiveSingleLimit.toFixed(2)}${
        currentLevel === AuthorityLevel.RESTRICTED ? ' (scaled by restricted mode multiplier)' : ''
      }`
    );
  }

  // 6. Hourly spend cap
  const projectedHourlySpend = (profile.metrics.hourlySpendUsd || 0) + action.amountUsd;
  if (projectedHourlySpend > constraints.maxHourlySpendUsd) {
    violations.push(
      `Projected hourly spend $${projectedHourlySpend.toFixed(2)} exceeds max hourly spend limit $${constraints.maxHourlySpendUsd.toFixed(2)}`
    );
  }

  // 7. Daily spend cap
  const projectedDailySpend = (profile.metrics.dailySpendUsd || 0) + action.amountUsd;
  if (projectedDailySpend > constraints.maxDailySpendUsd) {
    violations.push(
      `Projected daily spend $${projectedDailySpend.toFixed(2)} exceeds max daily spend limit $${constraints.maxDailySpendUsd.toFixed(2)}`
    );
  }

  return {
    passed: violations.length === 0,
    violations,
  };
}
