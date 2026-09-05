/**
 * Dashboard API & Telemetry Client
 */

export interface AgentProfile {
  agentId: string;
  name: string;
  currentAuthorityLevel: number;
  trustScore: {
    current: number;
    history: Array<{ timestamp: number; score: number; delta: number; reason: string }>;
  };
  policyConstraints: {
    maxSingleTransferUsd: number;
    maxHourlySpendUsd: number;
    allowedChains: string[];
    allowedProtocols: string[];
  };
  baseline: {
    isEstablished: boolean;
    meanAmountUsd: number;
    typicalActionsPerHour: number;
    knownDestinations: string[];
    knownProtocols: string[];
  };
  metrics: {
    totalActions: number;
    successfulActions: number;
    failedActions: number;
    hourlySpendUsd: number;
    dailySpendUsd: number;
    recentRetries: number;
  };
}

export interface ActionRecord {
  id: string;
  actionId: string;
  agentId: string;
  timestamp: number;
  action: {
    id: string;
    type: string;
    chain: string;
    protocol: string;
    destination: string;
    amountUsd: number;
    tokenSymbol: string;
  };
  decision: {
    allowed: boolean;
    requiresApproval: boolean;
    isFrozen: boolean;
    authorityLevel: number;
    previousAuthorityLevel: number;
    reason: string;
    riskAssessment: {
      score: number;
      factors: Array<{ label: string; points: number; description?: string }>;
    };
    driftSignals: {
      detected: boolean;
      driftScore: number;
      reasons: string[];
    };
    trustScore: number;
  };
  authorityLevel: number;
  executionStatus: 'pending' | 'executed' | 'rejected' | 'failed';
  executionTxHash?: string;
  errorMessage?: string;
}

export interface AuthorityEvent {
  id: number;
  agentId: string;
  fromLevel: number;
  toLevel: number;
  reason: string;
  timestamp: number;
}

const API_BASE = 'http://localhost:4000';

export async function fetchAgents(): Promise<AgentProfile[]> {
  try {
    const res = await fetch(`${API_BASE}/api/agents`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    // Fallback sample agent for standalone UI preview
    return [
      {
        agentId: 'daydreams-agent-alpha',
        name: 'Daydreams Agent Alpha (TaskMarket Worker)',
        currentAuthorityLevel: 0,
        trustScore: {
          current: 85,
          history: [
            { timestamp: Date.now() - 3600000, score: 80, delta: 0, reason: 'Baseline established' },
            { timestamp: Date.now() - 1800000, score: 85, delta: 5, reason: 'Clean task execution streak' },
          ],
        },
        policyConstraints: {
          maxSingleTransferUsd: 50,
          maxHourlySpendUsd: 150,
          allowedChains: ['base'],
          allowedProtocols: ['taskmarket', 'keeperhub'],
        },
        baseline: {
          isEstablished: true,
          meanAmountUsd: 1.5,
          typicalActionsPerHour: 10,
          knownDestinations: ['0x1234567890123456789012345678901234567890'],
          knownProtocols: ['taskmarket', 'keeperhub'],
        },
        metrics: {
          totalActions: 18,
          successfulActions: 17,
          failedActions: 1,
          hourlySpendUsd: 4.5,
          dailySpendUsd: 22.5,
          recentRetries: 0,
        },
      },
    ];
  }
}

export async function fetchActions(limit = 30): Promise<ActionRecord[]> {
  try {
    const res = await fetch(`${API_BASE}/api/actions?limit=${limit}`);
    if (!res.ok) throw new Error('Failed to fetch');
    return await res.json();
  } catch {
    // Fallback demo actions
    return [
      {
        id: 'rec_1',
        actionId: 'act_101',
        agentId: 'daydreams-agent-alpha',
        timestamp: Date.now() - 120000,
        action: {
          id: 'act_101',
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
          reason: 'Full autonomy: Operational parameters optimal',
          riskAssessment: { score: 10, factors: [] },
          driftSignals: { detected: false, driftScore: 0, reasons: [] },
          trustScore: 85,
        },
        authorityLevel: 0,
        executionStatus: 'executed',
        executionTxHash: '0x8f73b64c172d192837498c162534a7e9471b54bdA02913',
      },
      {
        id: 'rec_2',
        actionId: 'act_102',
        agentId: 'daydreams-agent-alpha',
        timestamp: Date.now() - 45000,
        action: {
          id: 'act_102',
          type: 'payment',
          chain: 'base',
          protocol: 'taskmarket',
          destination: '0x9999999999999999999999999999999999999999',
          amountUsd: 12.0,
          tokenSymbol: 'USDC',
        },
        decision: {
          allowed: true,
          requiresApproval: false,
          isFrozen: false,
          authorityLevel: 3,
          previousAuthorityLevel: 0,
          reason: 'Restricted authority applied: Moderate risk, new destination',
          riskAssessment: {
            score: 55,
            factors: [
              { label: 'amount anomaly', points: 25, description: '8x higher than baseline average' },
              { label: 'new destination', points: 20, description: 'Address outside baseline history' },
              { label: 'frequency anomaly', points: 10, description: 'Elevated velocity' },
            ],
          },
          driftSignals: {
            detected: true,
            driftScore: 45,
            reasons: ['Spend volume deviation: 8x baseline', 'Unfamiliar destination drift'],
          },
          trustScore: 72,
        },
        authorityLevel: 3,
        executionStatus: 'executed',
      },
    ];
  }
}
