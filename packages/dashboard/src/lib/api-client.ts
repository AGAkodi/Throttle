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

export const DEFAULT_PROFILE: AgentProfile = {
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

export const DEFAULT_ACTIONS: ActionRecord[] = [
  {
    id: 'act-seed-1',
    actionId: 'act-seed-1',
    agentId: 'agent-spike-runner',
    timestamp: Date.now() - 120000,
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
    timestamp: Date.now() - 360000,
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
];

export function getApiBase(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CONTROLLER_API_URL) {
    return import.meta.env.VITE_CONTROLLER_API_URL;
  }
  if (typeof window !== 'undefined') {
    const host = window.location.hostname;
    if (host !== 'localhost' && host !== '127.0.0.1') {
      return '';
    }
  }
  return 'http://localhost:4000';
}

export async function fetchAgents(): Promise<AgentProfile[]> {
  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/agents`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : [DEFAULT_PROFILE];
  } catch {
    return [DEFAULT_PROFILE];
  }
}

export async function fetchActions(limit = 50): Promise<ActionRecord[]> {
  const apiBase = getApiBase();
  try {
    const res = await fetch(`${apiBase}/api/actions?limit=${limit}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();
    return Array.isArray(data) && data.length > 0 ? data : DEFAULT_ACTIONS;
  } catch {
    return DEFAULT_ACTIONS;
  }
}

export interface TelemetryPayload {
  type: string;
  record?: ActionRecord;
  agent?: AgentProfile;
  decision?: any;
  scenario?: string;
}

export function subscribeToTelemetry(
  onEvent: (payload: TelemetryPayload) => void,
  onError?: (err: Event) => void
): () => void {
  const apiBase = getApiBase();
  const streamUrl = `${apiBase}/api/stream`;
  let eventSource: EventSource | null = null;
  let isClosed = false;

  try {
    eventSource = new EventSource(streamUrl);

    eventSource.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        onEvent(data);
      } catch (err) {
        console.error('[Telemetry] Failed to parse SSE event data:', err);
      }
    };

    eventSource.onerror = (err) => {
      if (!isClosed && onError) {
        onError(err);
      }
    };
  } catch (err) {
    console.error('[Telemetry] Could not establish EventSource connection:', err);
  }

  return () => {
    isClosed = true;
    if (eventSource) {
      eventSource.close();
    }
  };
}
