/**
 * TaskMarket Demo Agent
 * Autonomous agent that interacts with TaskMarket tasks, routing payments through
 * Dynamic Policy Groups and Gate 2 SignGate before KeeperHub signing.
 */

import { ThrottleStore, AgentProfile } from '@throttle/controller';
import { SignGate, X402ChallengePayload } from '@throttle/keeperhub-adapter';
import {
  TaskMarketClient,
  TaskMarketTask,
  ConfirmedSpendEvent,
  EarningsReceivedEvent,
  signTransferWithAuthorization,
  signClaimMessage,
  X402ChallengeData,
} from './taskmarket-client.js';
import { generateDynamicPolicyGroups } from './dynamic-policy-groups.js';
import { BehaviorEmitter } from './behavior-emitter.js';

export interface TaskMarketAgentConfig {
  agentId: string;
  workerAddress: string;
  store: ThrottleStore;
  client: TaskMarketClient;
  agentPrivateKey?: string;
  signGate?: SignGate;
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  stage: 'discovery' | 'dynamic_policy' | 'sign_claim' | 'settlement';
  authorityLevel: number;
  signature?: string;
  claimId?: string;
  txHash?: string;
  confirmedSpend?: ConfirmedSpendEvent;
  /** @deprecated Alias for confirmedSpend */
  earningsReceived?: ConfirmedSpendEvent;
  error?: string;
}

export class TaskMarketAgent {
  private config: TaskMarketAgentConfig;
  private emitter: BehaviorEmitter;

  constructor(config: TaskMarketAgentConfig) {
    this.config = config;
    this.emitter = new BehaviorEmitter(config.store);
  }

  /**
   * Executes an autonomous cycle:
   * 1. Fetches open tasks
   * 2. Checks client-side dynamic policy groups
   * 3. Signs canonical EIP-191 claim message "taskmarket:claim:<taskId>"
   * 4. Submits claim directly in a single request (no 402 challenge handshake)
   */
  public async runCycle(): Promise<TaskExecutionResult> {
    const { agentId, workerAddress, store, client } = this.config;
    const profile = store.getAgent(agentId);

    if (!profile) {
      return {
        taskId: '',
        success: false,
        stage: 'discovery',
        authorityLevel: 5,
        error: `Agent profile ${agentId} not found`,
      };
    }

    // Step 1: Coarse check via Dynamic Policy Groups
    const policyGroups = generateDynamicPolicyGroups(profile);
    const primaryPolicy = policyGroups[0];

    if (primaryPolicy.isHalted) {
      return {
        taskId: '',
        success: false,
        stage: 'dynamic_policy',
        authorityLevel: profile.currentAuthorityLevel,
        error: `Agent authority halted (${primaryPolicy.name})`,
      };
    }

    // Step 2: Fetch open tasks
    const tasks = await client.listOpenTasks();
    const candidateTask = tasks.find((t) => t.status === 'open' && t.mode === 'claim');

    if (!candidateTask) {
      return {
        taskId: '',
        success: false,
        stage: 'discovery',
        authorityLevel: profile.currentAuthorityLevel,
        error: 'no open claim-mode tasks available',
      };
    }

    this.emitter.emit({
      agentId,
      actionId: candidateTask.id,
      type: 'attempt',
    });

    // Step 3: Sign canonical EIP-191 claim message with agent private key
    const agentPrivateKey = this.config.agentPrivateKey || process.env.AGENT_WALLET_PRIVATE_KEY;
    if (!agentPrivateKey) {
      const errMsg = 'Missing AGENT_WALLET_PRIVATE_KEY for claim message signing';
      this.emitter.emit({
        agentId,
        actionId: candidateTask.id,
        type: 'failure',
        error: errMsg,
      });

      return {
        taskId: candidateTask.id,
        success: false,
        stage: 'sign_claim',
        authorityLevel: profile.currentAuthorityLevel,
        error: errMsg,
      };
    }

    let claimSignature: string;
    try {
      claimSignature = await signClaimMessage(agentPrivateKey, candidateTask.id);
    } catch (err: any) {
      this.emitter.emit({
        agentId,
        actionId: candidateTask.id,
        type: 'failure',
        error: `Agent EIP-191 claim signing failed: ${err.message}`,
      });

      return {
        taskId: candidateTask.id,
        success: false,
        stage: 'sign_claim',
        authorityLevel: profile.currentAuthorityLevel,
        error: `Agent EIP-191 claim signing failed: ${err.message}`,
      };
    }

    // Step 4: Submit claim in single request with EIP-191 signature (no 402 challenge)
    const claimResult = await client.claimTask(candidateTask.id, workerAddress, claimSignature);

    if (!claimResult.success || claimResult.status >= 400) {
      const errorMsg = claimResult.error || `Claim failed with HTTP ${claimResult.status}`;
      this.emitter.emit({
        agentId,
        actionId: candidateTask.id,
        type: 'failure',
        error: errorMsg,
      });

      return {
        taskId: candidateTask.id,
        success: false,
        stage: 'settlement',
        authorityLevel: profile.currentAuthorityLevel,
        signature: claimSignature,
        error: errorMsg,
      };
    }

    const claimId = claimResult.claimId || claimResult.data?.claimId || candidateTask.id;
    const txHash =
      claimResult.data?.txHash ||
      claimResult.data?.transactionHash ||
      claimResult.data?.hash ||
      claimResult.data?.reference ||
      claimId;

    const rawUnits = BigInt(candidateTask.reward || '0');
    const amountUsd = Number(rawUnits) / 1_000_000;

    const confirmedSpend: ConfirmedSpendEvent = {
      amount: candidateTask.reward || '0',
      amountUsd,
      txHash,
      taskId: candidateTask.id,
      timestamp: Date.now(),
      tokenSymbol: 'USDC',
    };

    this.emitter.emit({
      agentId,
      actionId: candidateTask.id,
      type: 'success',
    });

    return {
      taskId: candidateTask.id,
      success: true,
      stage: 'settlement',
      authorityLevel: profile.currentAuthorityLevel,
      signature: claimSignature,
      claimId,
      txHash,
      confirmedSpend,
      earningsReceived: confirmedSpend,
    };
  }

  /**
   * Executes an autonomous task creation cycle:
   * 1. Evaluates Dynamic Policy Groups (limits, halt status)
   * 2. Executes two-round EIP-3009/X402 task creation and on-chain escrow funding
   * 3. Confirms terminal on-chain txHash
   * 4. Builds and returns ConfirmedSpendEvent from the REAL task creation settlement
   */
  public async runTaskCreationCycle(params?: {
    reward?: string;
    description?: string;
    tags?: string[];
    mode?: string;
  }): Promise<TaskCreationCycleResult> {
    const { agentId, store, client } = this.config;
    const profile = store.getAgent(agentId);

    if (!profile) {
      return {
        taskId: '',
        intentId: '',
        txHash: '',
        success: false,
        stage: 'policy_check',
        authorityLevel: 5,
        error: `Agent profile ${agentId} not found`,
      };
    }

    // Step 1: Policy check via Dynamic Policy Groups
    const policyGroups = generateDynamicPolicyGroups(profile);
    const primaryPolicy = policyGroups[0];

    if (primaryPolicy.isHalted) {
      return {
        taskId: '',
        intentId: '',
        txHash: '',
        success: false,
        stage: 'policy_check',
        authorityLevel: profile.currentAuthorityLevel,
        error: `Agent authority halted (${primaryPolicy.name})`,
      };
    }

    const reward = params?.reward || '10000'; // 0.01 USDC default (10,000 atomic units)
    const rewardUsd = Number(BigInt(reward)) / 1_000_000;

    if (rewardUsd > primaryPolicy.maxPaymentUsd) {
      return {
        taskId: '',
        intentId: '',
        txHash: '',
        success: false,
        stage: 'policy_check',
        authorityLevel: profile.currentAuthorityLevel,
        error: `Reward $${rewardUsd.toFixed(2)} exceeds maximum policy spend $${primaryPolicy.maxPaymentUsd.toFixed(2)}`,
      };
    }

    const agentPrivateKey = this.config.agentPrivateKey || process.env.AGENT_WALLET_PRIVATE_KEY;
    if (!agentPrivateKey) {
      return {
        taskId: '',
        intentId: '',
        txHash: '',
        success: false,
        stage: 'creation_payment',
        authorityLevel: profile.currentAuthorityLevel,
        error: 'Missing AGENT_WALLET_PRIVATE_KEY for task creation settlement',
      };
    }

    this.emitter.emit({
      agentId,
      actionId: 'task-creation',
      type: 'attempt',
    });

    try {
      const creationResult = await client.createAndSettleTask({
        reward,
        description: params?.description || 'Autonomous claim task for Throttle dynamic autonomy pipeline verification',
        tags: params?.tags ?? ['throttle-verification', 'claim-mode'],
        mode: params?.mode ?? 'claim',
        privateKey: agentPrivateKey,
      });

      const confirmedSpend: ConfirmedSpendEvent = {
        amount: reward,
        amountUsd: rewardUsd,
        txHash: creationResult.txHash,
        taskId: creationResult.taskId,
        timestamp: Date.now(),
        tokenSymbol: 'USDC',
      };

      this.emitter.emit({
        agentId,
        actionId: creationResult.taskId,
        type: 'success',
      });

      return {
        taskId: creationResult.taskId,
        intentId: creationResult.intentId,
        txHash: creationResult.txHash,
        success: true,
        stage: 'intent_settlement',
        authorityLevel: profile.currentAuthorityLevel,
        confirmedSpend,
      };
    } catch (err: any) {
      const errMsg = err?.cause ? `${err.message} (cause: ${err.cause?.message || err.cause})` : (err?.message || String(err));
      this.emitter.emit({
        agentId,
        actionId: 'task-creation',
        type: 'failure',
        error: errMsg,
      });

      return {
        taskId: '',
        intentId: '',
        txHash: '',
        success: false,
        stage: 'creation_payment',
        authorityLevel: profile.currentAuthorityLevel,
        error: errMsg,
      };
    }
  }
}

export interface TaskCreationCycleResult {
  taskId: string;
  intentId: string;
  txHash: string;
  success: boolean;
  stage: 'policy_check' | 'creation_payment' | 'intent_settlement';
  authorityLevel: number;
  confirmedSpend?: ConfirmedSpendEvent;
  error?: string;
}


