/**
 * Gate 3: Sweep-Gate (Downstream Treasury Allocation / Sweep Controller)
 * Gating point for KeeperHub-executed treasury actions triggered by confirmed agent spend.
 *
 * Operational Rationale:
 * When the agent confirms an outbound on-chain spend on TaskMarket (claim-fee settlement),
 * Throttle evaluates the spend telemetry through its 5-layer pipeline and gates downstream
 * KeeperHub execution (moving matching funds from the org Turnkey wallet to treasury/reserve).
 * This models automated, policy-gated rebalancing/sweeps triggered by agent operational expenses.
 *
 * Evaluates risk, trust, drift, and authority before authorizing KeeperHub to move funds.
 */

import crypto from 'crypto';
import {
  evaluateAndUpdateProfile,
  AgentProfile,
  ProposedAction,
  ThrottleStore,
  createActionRecord,
  AuthorityLevel,
} from '@throttle/controller';
import { mapToSignGateDecision, SignGateDecision } from './decision-mapper.js';
import { KeeperHubMcpClient } from './mcp-client.js';

export interface ConfirmedSpendEvent {
  amount: string; // raw base units (e.g. "1000000" for 1 USDC)
  amountUsd: number;
  txHash: string;
  taskId: string;
  timestamp: number;
  tokenSymbol: string;
  recipientAddress?: string;
}

/** @deprecated Alias for backwards compatibility */
export type EarningsReceivedEvent = ConfirmedSpendEvent;

export interface SweepGateConfig {
  store: ThrottleStore;
  keeperHubApiKey?: string;
  keeperHubBaseUrl?: string;
  sweepWorkflowId?: string;
  treasuryAddress?: string;
  simulationMode?: boolean;
  mcpClient?: KeeperHubMcpClient;
}

export interface SweepGateResult {
  decision: SignGateDecision;
  status: 'executed' | 'held' | 'rejected' | 'error';
  txHash?: string;
  executionId?: string;
  simulated?: boolean;
  errorMessage?: string;
}

export class SweepGate {
  private config: SweepGateConfig;
  private mcpClient: KeeperHubMcpClient;

  constructor(config: SweepGateConfig) {
    this.config = config;
    this.mcpClient =
      config.mcpClient ||
      new KeeperHubMcpClient({
        apiKey: config.keeperHubApiKey || '',
        baseUrl: config.keeperHubBaseUrl || 'https://app.keeperhub.com',
        simulationMode: config.simulationMode,
      });
  }

  /**
   * Evaluates a ConfirmedSpend event through the Throttle Controller pipeline
   * and dispatches a KeeperHub-executed treasury sweep/transfer if authorized.
   */
  public async handleConfirmedSpend(
    agentId: string,
    spend: ConfirmedSpendEvent,
    targetTreasuryAddress?: string
  ): Promise<SweepGateResult> {
    const store = this.config.store;
    const profile = store.getAgent(agentId);
    const treasury =
      targetTreasuryAddress ||
      spend.recipientAddress ||
      this.config.treasuryAddress ||
      '0x742d35Cc6634C0532925a3b844Bc454e4438f44e';

    if (!profile) {
      return {
        decision: {
          action: 'reject',
          reason: `Agent profile '${agentId}' not found in controller store`,
          metadata: {
            authorityLevel: AuthorityLevel.FROZEN,
            authorityLevelName: 'Level 5: Frozen',
            riskScore: 100,
            trustScore: 0,
            driftDetected: true,
            factors: [{ label: 'missing profile', points: 100 }],
          },
        },
        status: 'rejected',
        errorMessage: 'Agent profile missing',
      };
    }

    const proposedAction: ProposedAction = {
      id: `sweep_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      timestamp: Date.now(),
      type: 'transfer',
      chain: 'base',
      protocol: 'keeperhub',
      destination: treasury,
      amount: spend.amount,
      amountUsd: spend.amountUsd,
      tokenSymbol: spend.tokenSymbol || 'USDC',
      metadata: {
        taskId: spend.taskId,
        settlementTxHash: spend.txHash,
        targetTreasury: treasury,
      },
    };

    // Evaluate through Controller layers 1-5 (Policy, Risk, Drift, Trust, Authority)
    const { decision, updatedProfile } = evaluateAndUpdateProfile(proposedAction, profile);

    // Save updated profile and authority events if level changed
    store.saveAgent(updatedProfile);
    if (decision.levelChanged) {
      store.recordAuthorityEvent({
        agentId,
        fromLevel: decision.previousAuthorityLevel,
        toLevel: decision.authorityLevel,
        reason: decision.reason,
        timestamp: decision.timestamp,
      });
    }

    // Save policy violations if any
    if (!decision.policyEvaluation.passed) {
      store.recordPolicyViolation({
        agentId,
        actionId: proposedAction.id,
        violations: decision.policyEvaluation.violations,
        timestamp: decision.timestamp,
      });
    }

    const gateDecision = mapToSignGateDecision(decision);

    // Level 5 (Frozen) or hard policy violation: Reject immediately
    if (gateDecision.action === 'reject') {
      const record = createActionRecord(proposedAction, decision, 'rejected', undefined, decision.reason);
      store.saveActionRecord(record);
      return {
        decision: gateDecision,
        status: 'rejected',
        errorMessage: decision.reason,
      };
    }

    // Level 4 (Approval Required): Hold for human operator confirmation
    if (gateDecision.action === 'hold') {
      const record = createActionRecord(
        proposedAction,
        decision,
        'pending',
        undefined,
        'Held for human operator approval before sweep execution'
      );
      store.saveActionRecord(record);
      return {
        decision: gateDecision,
        status: 'held',
      };
    }

    // ALLOW / MONITOR: Proceed with KeeperHub workflow execution
    const workflowId = this.config.sweepWorkflowId || 'kh-treasury-sweep-wf';
    const idempotencyKey = `sweep_idem_${proposedAction.id}`;
    const workflowInput = {
      recipientAddress: treasury,
      amount: spend.amountUsd.toString(),
      token: 'USDC',
      chain: 'base',
      taskId: spend.taskId,
    };

    try {
      // Step A: Preflight dry run (simulate: true)
      await this.mcpClient.executeWorkflow({
        workflowId,
        input: workflowInput,
        simulate: true,
        idempotencyKey: `preflight_${idempotencyKey}`,
      });

      // Step B: Real execution with idempotency key
      const isSimulate = Boolean(this.config.simulationMode);
      const execution = await this.mcpClient.executeWorkflow({
        workflowId,
        input: workflowInput,
        simulate: isSimulate,
        idempotencyKey,
      });

      // Step C: Poll get_execution to confirm completion and retrieve txHash
      const execStatus = await this.mcpClient.getExecution(execution.executionId);
      const txHash = execStatus.txHash || execution.txHash;
      if (!txHash) {
        throw new Error(
          `[SweepGate] Workflow execution ${execution.executionId} reported success ` +
          `but returned no transaction hash. Refusing to fabricate one.`
        );
      }

      const record = createActionRecord(proposedAction, decision, 'executed', txHash);
      store.saveActionRecord(record);

      return {
        decision: gateDecision,
        status: 'executed',
        txHash,
        executionId: execution.executionId,
        simulated: isSimulate,
      };
    } catch (err: any) {
      const record = createActionRecord(proposedAction, decision, 'failed', undefined, err.message);
      store.saveActionRecord(record);

      return {
        decision: gateDecision,
        status: 'error',
        errorMessage: err.message,
      };
    }
  }

  /** @deprecated Alias for backwards compatibility */
  public handleEarningsReceived = this.handleConfirmedSpend;
}
