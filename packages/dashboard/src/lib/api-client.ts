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

export function getApiBase(): string {
  if (typeof import.meta !== 'undefined' && import.meta.env?.VITE_CONTROLLER_API_URL) {
    return import.meta.env.VITE_CONTROLLER_API_URL;
  }
  return 'http://localhost:4000';
}

export async function fetchAgents(): Promise<AgentProfile[]> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/agents`);
  if (!res.ok) {
    throw new Error(`Failed to fetch agents: HTTP ${res.status}`);
  }
  return await res.json();
}

export async function fetchActions(limit = 50): Promise<ActionRecord[]> {
  const apiBase = getApiBase();
  const res = await fetch(`${apiBase}/api/actions?limit=${limit}`);
  if (!res.ok) {
    throw new Error(`Failed to fetch actions: HTTP ${res.status}`);
  }
  return await res.json();
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
