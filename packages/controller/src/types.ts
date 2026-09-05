/**
 * Throttle Dynamic Autonomy Controller — Type System
 * Defines the 6-level authority hierarchy, action shapes, risk models, drift metrics, and decisions.
 */

/**
 * Six distinct authority levels.
 * Each level represents a distinct behavioral mode and operational constraint.
 */
export enum AuthorityLevel {
  /** Level 0: Full autonomy — standard operation, no intervention */
  FULL_AUTONOMY = 0,
  /** Level 1: Logged autonomy — execution allowed with enhanced audit detail captured */
  LOGGED_AUTONOMY = 1,
  /** Level 2: Enhanced monitoring — execution allowed + high-frequency re-evaluation */
  ENHANCED_MONITORING = 2,
  /** Level 3: Restricted — execution restricted to reduced spending limits & known targets */
  RESTRICTED = 3,
  /** Level 4: Approval required — execution paused pending human sign-off */
  APPROVAL_REQUIRED = 4,
  /** Level 5: Frozen — execution completely denied / blocked */
  FROZEN = 5,
}

export type ActionType = 'payment' | 'transfer' | 'tool_call' | 'contract_call';

export interface ProposedAction {
  id: string;
  agentId: string;
  timestamp: number;
  type: ActionType;
  chain: string;
  protocol: string;
  destination: string;
  amount: string; // raw token base units (e.g. 1000000 for 1 USDC)
  amountUsd: number;
  tokenSymbol: string;
  toolName?: string;
  toolArgs?: Record<string, unknown>;
  metadata?: Record<string, unknown>;
}

export interface PolicyConstraints {
  maxSingleTransferUsd: number;
  maxHourlySpendUsd: number;
  maxDailySpendUsd: number;
  allowedChains: string[];
  allowedProtocols: string[];
  destinationAllowlist?: string[];
  destinationBlocklist?: string[];
  restrictedMultiplier?: number; // spend limit multiplier when in Level 3 (e.g. 0.25)
}

export interface RiskFactor {
  label: string;
  points: number;
  description?: string;
}

export interface RiskAssessment {
  score: number; // 0-100
  factors: RiskFactor[];
}

export interface DriftSignals {
  detected: boolean;
  driftScore: number; // 0-100
  amountDeviationRatio: number; // current / baseline mean
  frequencyDeviationRatio: number; // current actions/hr / baseline
  isNewDestination: boolean;
  isNewProtocol: boolean;
  recentFailureRate: number; // 0.0 - 1.0
  retryCount: number;
  reasons: string[];
}

export interface TrustScoreHistoryEntry {
  timestamp: number;
  score: number;
  delta: number;
  reason: string;
}

export interface TrustScore {
  current: number; // 0-100
  halfLifeMs: number; // decay half-life in milliseconds (e.g. 24h = 86400000)
  lastUpdated: number;
  history: TrustScoreHistoryEntry[];
}

export interface AgentBaseline {
  isEstablished: boolean;
  sampleSize: number;
  meanAmountUsd: number;
  stdDevAmountUsd: number;
  typicalActionsPerHour: number;
  knownDestinations: string[];
  knownProtocols: string[];
  typicalRetryRate: number;
  establishedAt?: number;
}

export interface AgentMetrics {
  totalActions: number;
  successfulActions: number;
  failedActions: number;
  consecutiveSuccessfulActions: number;
  hourlySpendUsd: number;
  dailySpendUsd: number;
  lastActionTimestamp: number;
  windowStartTimestamp: number;
  recentRetries: number;
}

export interface AgentProfile {
  agentId: string;
  name: string;
  currentAuthorityLevel: AuthorityLevel;
  policyConstraints: PolicyConstraints;
  trustScore: TrustScore;
  baseline: AgentBaseline;
  metrics: AgentMetrics;
  createdAt: number;
  updatedAt: number;
}

export interface PolicyEvaluation {
  passed: boolean;
  violations: string[];
}

export interface Decision {
  id: string;
  actionId: string;
  agentId: string;
  timestamp: number;
  allowed: boolean;
  requiresApproval: boolean;
  isFrozen: boolean;
  authorityLevel: AuthorityLevel;
  previousAuthorityLevel: AuthorityLevel;
  levelChanged: boolean;
  reason: string;
  policyEvaluation: PolicyEvaluation;
  riskAssessment: RiskAssessment;
  driftSignals: DriftSignals;
  trustScore: number;
}

export interface ActionRecord {
  id: string;
  actionId: string;
  agentId: string;
  timestamp: number;
  action: ProposedAction;
  decision: Decision;
  authorityLevel: AuthorityLevel;
  executionStatus: 'pending' | 'executed' | 'rejected' | 'failed';
  executionTxHash?: string;
  errorMessage?: string;
}
