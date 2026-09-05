/**
 * Gate 1: PreToolUse Dynamic Autonomy Hook
 * Coarse interception that fires at tool-call time before an exact 402 payment challenge is generated.
 * Adheres strictly to GUARD-05: extracts only verified system fields, never trusting LLM self-evaluations.
 */

import { evaluate, AgentProfile, ProposedAction, ThrottleStore, createActionRecord } from '@throttle/controller';
import { mapToHookDecision, PreToolUseHookDecision } from './decision-mapper.js';

export interface PreToolUseInput {
  tool: string;
  arguments: Record<string, unknown>;
  agentId?: string;
  chain?: string;
}

export interface DynamicAutonomyHookOptions {
  store: ThrottleStore;
  defaultAgentId?: string;
}

/**
 * Creates a Claude / IDE PreToolUse hook function for Throttle.
 */
export function createDynamicAutonomyHook(options: DynamicAutonomyHookOptions) {
  const defaultAgentId = options.defaultAgentId || 'default-agent';

  return async function dynamicAutonomyHook(input: PreToolUseInput): Promise<PreToolUseHookDecision> {
    const agentId = input.agentId || defaultAgentId;
    let profile = options.store.getAgent(agentId);

    if (!profile) {
      // Return safe allow if profile is uninitialized, but alert in metadata
      return {
        decision: 'allow',
        reason: 'Unregistered agent profile — initial pass-through for bootstrap',
        metadata: {
          authorityLevel: 0,
          authorityLevelName: 'Level 0: Bootstrap',
          riskScore: 0,
          trustScore: 80,
          driftDetected: false,
        },
      };
    }

    // GUARD-05 field-extraction discipline:
    // Extract only deterministic parameters. Never read self-reported safety tags from tool arguments.
    const toolName = input.tool;
    const args = input.arguments || {};

    const destination = typeof args.to === 'string'
      ? args.to
      : typeof args.destination === 'string'
      ? args.destination
      : typeof args.contract === 'string'
      ? args.contract
      : '0x0000000000000000000000000000000000000000';

    const chain = typeof args.chain === 'string' ? args.chain : (input.chain || 'base');
    const protocol = typeof args.protocol === 'string' ? args.protocol : 'taskmarket';

    // Amount is often unknown or coarse at tool invocation time
    const amountUsd = typeof args.amountUsd === 'number' ? args.amountUsd : 0;
    const amountRaw = typeof args.amount === 'string' ? args.amount : '0';

    const proposedAction: ProposedAction = {
      id: `tool_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      timestamp: Date.now(),
      type: 'tool_call',
      chain,
      protocol,
      destination,
      amount: amountRaw,
      amountUsd,
      tokenSymbol: 'USDC',
      toolName,
      toolArgs: args,
    };

    // Evaluate through Controller core
    const decision = evaluate(proposedAction, profile);

    // Persist coarse audit trail
    const record = createActionRecord(
      proposedAction,
      decision,
      decision.allowed ? 'executed' : 'rejected'
    );
    options.store.saveActionRecord(record);

    return mapToHookDecision(decision);
  };
}
