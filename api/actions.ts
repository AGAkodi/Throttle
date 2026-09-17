export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const limit = parseInt(req.query?.limit || '50', 10);
  const now = Date.now();
  const seedActions = [
    {
      id: 'act-seed-1',
      actionId: 'act-seed-1',
      agentId: 'agent-spike-runner',
      timestamp: now - 120000,
      action: {
        id: 'act-seed-1',
        type: 'payment',
        chain: 'base',
        protocol: 'taskmarket',
        destination: '0x1234567890123456789012345678901234567890',
        amountUsd: 1.5,
        tokenSymbol: 'USDC',
      },
      decision: {
        allowed: true,
        requiresApproval: false,
        isFrozen: false,
        authorityLevel: 0,
        previousAuthorityLevel: 0,
        reason: 'Parameters match baseline model and verified against Turnkey policy caps',
        riskAssessment: { score: 12, factors: [{ label: 'Clean parameters', points: 0 }] },
        driftSignals: { detected: false, driftScore: 0, reasons: [] },
        trustScore: 85,
      },
      authorityLevel: 0,
      executionStatus: 'executed',
      executionTxHash: '0x62a1b9f71c3569d123bca048997ef2a188147d1b32788e0019bf45a4944b209e',
    },
    {
      id: 'act-seed-2',
      actionId: 'act-seed-2',
      agentId: 'agent-spike-runner',
      timestamp: now - 360000,
      action: {
        id: 'act-seed-2',
        type: 'payment',
        chain: 'base',
        protocol: 'taskmarket',
        destination: '0x2345678901234567890123456789012345678901',
        amountUsd: 2.0,
        tokenSymbol: 'USDC',
      },
      decision: {
        allowed: true,
        requiresApproval: false,
        isFrozen: false,
        authorityLevel: 0,
        previousAuthorityLevel: 0,
        reason: 'Compliant escrow settlement approved under Full Autonomy (Level 0)',
        riskAssessment: { score: 15, factors: [{ label: 'Compliant spend', points: 0 }] },
        driftSignals: { detected: false, driftScore: 0, reasons: [] },
        trustScore: 85,
      },
      authorityLevel: 0,
      executionStatus: 'executed',
      executionTxHash: '0x8f2d5e7a9c1b3467812dfa450192837465019283746501928374650192837465',
    },
    {
      id: 'act-seed-3',
      actionId: 'act-seed-3',
      agentId: 'agent-spike-runner',
      timestamp: now - 720000,
      action: {
        id: 'act-seed-3',
        type: 'payment',
        chain: 'base',
        protocol: 'taskmarket',
        destination: '0x3456789012345678901234567890123456789012',
        amountUsd: 1.5,
        tokenSymbol: 'USDC',
      },
      decision: {
        allowed: true,
        requiresApproval: false,
        isFrozen: false,
        authorityLevel: 0,
        previousAuthorityLevel: 0,
        reason: 'Normal baseline activity logged and approved',
        riskAssessment: { score: 10, factors: [{ label: 'Baseline match', points: 0 }] },
        driftSignals: { detected: false, driftScore: 0, reasons: [] },
        trustScore: 80,
      },
      authorityLevel: 0,
      executionStatus: 'executed',
      executionTxHash: '0x3a9b1c7d2e4f586017283940516273849501a2b3c4d5e6f708192a3b4c5d6e7f',
    },
  ];

  return res.status(200).json(seedActions.slice(0, limit));
}
