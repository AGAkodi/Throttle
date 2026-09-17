import { DEFAULT_PROFILE } from './agents.js';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const scenario = body.scenario || 'seed';
  const now = Date.now();

  let newLevel = 0;
  let newTrust = 85;
  let reason = '';
  let allowed = true;
  let requiresApproval = false;
  let isFrozen = false;
  let executionStatus: 'executed' | 'pending' | 'rejected' = 'executed';
  let executionTxHash: string | undefined = undefined;

  if (scenario === 'seed') {
    newLevel = 0;
    newTrust = 85;
    reason = 'Baseline re-established: Full Autonomy (Level 0)';
    executionTxHash = '0xseed' + Math.random().toString(16).substring(2, 10);
  } else if (scenario === 'drift') {
    newLevel = 3;
    newTrust = 68;
    reason = 'Behavioral drift detected: 8x baseline spend & unfamiliar destination';
    executionTxHash = '0xdrift' + Math.random().toString(16).substring(2, 10);
  } else if (scenario === 'approval') {
    newLevel = 4;
    newTrust = 52;
    allowed = false;
    requiresApproval = true;
    executionStatus = 'pending';
    reason = 'Held in custody at Level 4: Risk threshold exceeded (unverified protocol & 28x anomaly)';
  } else if (scenario === 'violation') {
    newLevel = 5;
    newTrust = 20;
    allowed = false;
    isFrozen = true;
    executionStatus = 'rejected';
    reason = 'Hard policy breach: Unauthorized chain (solana) & single transfer cap exceeded';
  } else {
    // recovery
    newLevel = 1;
    newTrust = 82;
    reason = 'Rehabilitation recovery: Clean streak restored agent to Logged Autonomy';
    executionTxHash = '0xrecov' + Math.random().toString(16).substring(2, 10);
  }

  const updatedAgent = {
    ...DEFAULT_PROFILE,
    currentAuthorityLevel: newLevel,
    trustScore: {
      current: newTrust,
      history: [
        { timestamp: now, score: newTrust, delta: newTrust - 85, reason },
        ...DEFAULT_PROFILE.trustScore.history,
      ],
    },
  };

  const record = {
    id: `act_${scenario}_${now}`,
    actionId: `act_${scenario}_${now}`,
    agentId: updatedAgent.agentId,
    timestamp: now,
    action: {
      id: `act_${scenario}_${now}`,
      type: 'payment',
      chain: scenario === 'violation' ? 'solana' : 'base',
      protocol: scenario === 'approval' ? 'unverified_dex' : 'taskmarket',
      destination: scenario === 'approval' ? '0x8888888888888888888888888888888888888888' : '0x1234567890123456789012345678901234567890',
      amountUsd: scenario === 'violation' ? 800 : (scenario === 'approval' ? 42 : (scenario === 'drift' ? 12 : 1.5)),
      tokenSymbol: 'USDC',
    },
    decision: {
      allowed,
      requiresApproval,
      isFrozen,
      authorityLevel: newLevel,
      previousAuthorityLevel: 0,
      reason,
      riskAssessment: {
        score: scenario === 'violation' ? 95 : (scenario === 'approval' ? 75 : (scenario === 'drift' ? 45 : 12)),
        factors: [
          { label: scenario === 'violation' ? 'Chain unauthorized' : (scenario === 'approval' ? 'Novel protocol' : 'Baseline variance'), points: 20 },
        ],
      },
      driftSignals: {
        detected: scenario === 'drift' || scenario === 'approval',
        driftScore: scenario === 'approval' ? 65 : (scenario === 'drift' ? 55 : 0),
        reasons: scenario === 'drift' ? ['8x amount deviation', 'new destination'] : [],
      },
      trustScore: newTrust,
    },
    authorityLevel: newLevel,
    executionStatus,
    executionTxHash,
  };

  return res.status(200).json({
    success: true,
    scenario,
    agent: updatedAgent,
    record,
    decision: record.decision,
  });
}
