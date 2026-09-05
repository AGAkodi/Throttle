import { AgentProfile, AuthorityLevel, PolicyConstraints } from '../types.js';

export function createDefaultProfile(
  agentId: string,
  name: string,
  customConstraints?: Partial<PolicyConstraints>
): AgentProfile {
  const now = Date.now();

  const policyConstraints: PolicyConstraints = {
    maxSingleTransferUsd: customConstraints?.maxSingleTransferUsd ?? 50.0,
    maxHourlySpendUsd: customConstraints?.maxHourlySpendUsd ?? 150.0,
    maxDailySpendUsd: customConstraints?.maxDailySpendUsd ?? 500.0,
    allowedChains: customConstraints?.allowedChains ?? ['base'],
    allowedProtocols: customConstraints?.allowedProtocols ?? ['taskmarket', 'keeperhub'],
    destinationAllowlist: customConstraints?.destinationAllowlist,
    destinationBlocklist: customConstraints?.destinationBlocklist ?? [],
    restrictedMultiplier: customConstraints?.restrictedMultiplier ?? 0.25,
  };

  return {
    agentId,
    name,
    currentAuthorityLevel: AuthorityLevel.FULL_AUTONOMY,
    policyConstraints,
    trustScore: {
      current: 85.0,
      halfLifeMs: 24 * 60 * 60 * 1000,
      lastUpdated: now,
      history: [
        {
          timestamp: now,
          score: 85.0,
          delta: 0,
          reason: 'Initial profile provisioning',
        },
      ],
    },
    baseline: {
      isEstablished: false,
      sampleSize: 0,
      meanAmountUsd: 0,
      stdDevAmountUsd: 0,
      typicalActionsPerHour: 10,
      knownDestinations: [],
      knownProtocols: ['taskmarket', 'keeperhub'],
      typicalRetryRate: 0.05,
    },
    metrics: {
      totalActions: 0,
      successfulActions: 0,
      failedActions: 0,
      consecutiveSuccessfulActions: 0,
      hourlySpendUsd: 0,
      dailySpendUsd: 0,
      lastActionTimestamp: now,
      windowStartTimestamp: now,
      recentRetries: 0,
    },
    createdAt: now,
    updatedAt: now,
  };
}
