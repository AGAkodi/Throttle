import { DEFAULT_PROFILE } from './agents.js';

export default function handler(req: any, res: any) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : (req.body || {});
  const amountUsd = parseFloat(body.amountUsd || '1.5');
  const destination = body.destination || '0x1234567890123456789012345678901234567890';
  const protocol = body.protocol || 'taskmarket';
  const chain = body.chain || 'base';

  let allowed = true;
  let requiresApproval = false;
  let isFrozen = false;
  let level = 0;
  let reason = 'All policy constraints satisfied; parameters match historical baseline.';
  const factors: Array<{ label: string; points: number }> = [];

  // Policy check: Chain
  if (chain !== 'base') {
    allowed = false;
    isFrozen = true;
    level = 5;
    reason = `Hard Policy Breach: Chain '${chain}' is not allowlisted (only Base is authorized).`;
    factors.push({ label: 'Unauthorized chain', points: 50 });
  }

  // Policy check: Blocklisted destination
  if (destination.toLowerCase() === '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef') {
    allowed = false;
    isFrozen = true;
    level = 5;
    reason = 'Hard Policy Breach: Destination is on the security blocklist.';
    factors.push({ label: 'Blocklisted destination', points: 60 });
  }

  // Policy check: Amount cap ($50)
  if (amountUsd > 50) {
    allowed = false;
    if (amountUsd > 100) {
      isFrozen = true;
      level = 5;
      reason = `Hard Policy Breach: Amount $${amountUsd} exceeds hard safety cap ($50).`;
    } else {
      requiresApproval = true;
      level = 4;
      reason = `Amount $${amountUsd} exceeds single transfer cap ($50). Held in custody for human review.`;
    }
    factors.push({ label: 'Transfer cap exceeded', points: 40 });
  }

  // Novel protocol check
  if (protocol === 'unverified_dex' && level < 4) {
    allowed = false;
    requiresApproval = true;
    level = 4;
    reason = 'Novel unverified protocol detected. Held for human operator approval (Level 4).';
    factors.push({ label: 'Unverified protocol', points: 30 });
  }

  // Drift check: Novel destination & high amount
  if (destination === '0x9999999999999999999999999999999999999999' && level < 3) {
    level = 3;
    reason = 'Behavioral drift detected: Unfamiliar destination address with elevated spend.';
    factors.push({ label: 'Unfamiliar destination', points: 25 });
  }

  if (factors.length === 0) {
    factors.push({ label: 'Clean historical parameters', points: 0 });
  }

  const decision = {
    allowed,
    requiresApproval,
    isFrozen,
    authorityLevel: level,
    previousAuthorityLevel: 0,
    reason,
    riskAssessment: {
      score: factors.reduce((sum, f) => sum + f.points, 0),
      factors,
    },
    driftSignals: {
      detected: level >= 3,
      driftScore: level >= 3 ? 50 : 0,
      reasons: factors.map(f => f.label),
    },
    trustScore: Math.max(10, 85 - factors.reduce((sum, f) => sum + f.points, 0)),
  };

  const record = {
    id: `act_${Date.now()}`,
    actionId: `act_${Date.now()}`,
    agentId: 'agent-spike-runner',
    timestamp: Date.now(),
    action: {
      id: `act_${Date.now()}`,
      type: 'payment',
      chain,
      protocol,
      destination,
      amountUsd,
      tokenSymbol: 'USDC',
    },
    decision,
    authorityLevel: level,
    executionStatus: allowed ? 'executed' : (requiresApproval ? 'pending' : 'rejected'),
    executionTxHash: allowed ? `0xsim_${Date.now().toString(16)}` : undefined,
  };

  return res.status(200).json({
    decision,
    record,
    agent: {
      ...DEFAULT_PROFILE,
      currentAuthorityLevel: level,
      trustScore: { current: decision.trustScore, history: [] },
    },
  });
}
