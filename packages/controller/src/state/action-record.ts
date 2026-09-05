import { ActionRecord, Decision, ProposedAction } from '../types.js';

export function createActionRecord(
  action: ProposedAction,
  decision: Decision,
  executionStatus: 'pending' | 'executed' | 'rejected' | 'failed' = 'pending',
  executionTxHash?: string,
  errorMessage?: string
): ActionRecord {
  return {
    id: `rec_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
    actionId: action.id,
    agentId: action.agentId,
    timestamp: action.timestamp || Date.now(),
    action,
    decision,
    // Explicitly preserves the distinct 6-level authority level (0 vs 1 vs 2 etc)
    authorityLevel: decision.authorityLevel,
    executionStatus,
    executionTxHash,
    errorMessage,
  };
}
