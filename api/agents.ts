export const DEFAULT_PROFILE = {
  agentId: 'agent-spike-runner',
  name: 'Daydreams Agent Alpha (Spike Runner)',
  currentAuthorityLevel: 0,
  trustScore: {
    current: 85,
    history: [
      { timestamp: Date.now() - 3600000, score: 80, delta: 5, reason: 'Consecutive compliant task settlement' },
      { timestamp: Date.now() - 1800000, score: 85, delta: 5, reason: 'Zero policy violations' },
    ],
  },
  policyConstraints: {
    maxSingleTransferUsd: 50.0,
    maxHourlySpendUsd: 150.0,
    allowedChains: ['base'],
    allowedProtocols: ['taskmarket', 'keeperhub'],
    destinationBlocklist: ['0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef'],
  },
  baseline: {
    isEstablished: true,
    meanAmountUsd: 1.5,
    typicalActionsPerHour: 10,
    knownDestinations: [
      '0x1234567890123456789012345678901234567890',
      '0x2345678901234567890123456789012345678901',
      '0x3456789012345678901234567890123456789012',
    ],
    knownProtocols: ['taskmarket', 'keeperhub'],
  },
  metrics: {
    totalActions: 12,
    successfulActions: 12,
    failedActions: 0,
    hourlySpendUsd: 18.0,
    dailySpendUsd: 42.5,
    recentRetries: 0,
  },
};

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  return res.status(200).json([DEFAULT_PROFILE]);
}
