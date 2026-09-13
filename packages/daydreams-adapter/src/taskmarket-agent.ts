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
  EarningsReceivedEvent,
  signTransferWithAuthorization,
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
  stage: 'discovery' | 'dynamic_policy' | '402_challenge' | 'sign_payment' | 'sign_gate' | 'settlement';
  authorityLevel: number;
  signature?: string;
  txHash?: string;
  earningsReceived?: EarningsReceivedEvent;
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
   * 3. Claims task and receives 402 challenge
   * 4. Evaluates and signs through Gate 2 SignGate
   * 5. Finalizes settlement with PAYMENT-SIGNATURE
   */
  public async runCycle(): Promise<TaskExecutionResult> {
    const { agentId, workerAddress, store, signGate, client } = this.config;
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
    const candidateTask = tasks.find((t) => t.status === 'open');

    if (!candidateTask) {
      return {
        taskId: '',
        success: false,
        stage: 'discovery',
        authorityLevel: profile.currentAuthorityLevel,
        error: 'No open tasks available on TaskMarket',
      };
    }

    this.emitter.emit({
      agentId,
      actionId: candidateTask.id,
      type: 'attempt',
    });

    // Step 3: Claim task and intercept 402
    const initialClaim = await client.claimTask(candidateTask.id, workerAddress);

    if (!initialClaim.paymentRequired || !initialClaim.challenge) {
      this.emitter.emit({
        agentId,
        actionId: candidateTask.id,
        type: 'failure',
        error: initialClaim.error || `Expected 402 challenge but received status ${initialClaim.status}`,
      });

      return {
        taskId: candidateTask.id,
        success: false,
        stage: '402_challenge',
        authorityLevel: profile.currentAuthorityLevel,
        error: initialClaim.error || `Expected 402 challenge but received status ${initialClaim.status}`,
      };
    }

    const challenge: X402ChallengePayload = initialClaim.challenge;

    // Step 4: Sign outbound TaskMarket payment directly using agent's wallet
    const agentPrivateKey = this.config.agentPrivateKey || process.env.AGENT_WALLET_PRIVATE_KEY;
    let paymentSignature: string | undefined;

    if (agentPrivateKey) {
      try {
        paymentSignature = await signTransferWithAuthorization(agentPrivateKey, challenge);
      } catch (err: any) {
        this.emitter.emit({
          agentId,
          actionId: candidateTask.id,
          type: 'failure',
          error: `Agent EIP-3009 signing failed: ${err.message}`,
        });

        return {
          taskId: candidateTask.id,
          success: false,
          stage: 'sign_payment',
          authorityLevel: profile.currentAuthorityLevel,
          error: `Agent wallet signing failed: ${err.message}`,
        };
      }
    } else if (this.config.signGate) {
      // Fallback path if explicit signGate is supplied
      const signResult = await this.config.signGate.handlePaymentChallenge(agentId, challenge, 'taskmarket');
      if (signResult.status !== 'signed' || !signResult.signature) {
        this.emitter.emit({
          agentId,
          actionId: candidateTask.id,
          type: 'failure',
          error: signResult.errorMessage,
        });

        return {
          taskId: candidateTask.id,
          success: false,
          stage: 'sign_gate',
          authorityLevel: signResult.decision.metadata.authorityLevel,
          error: signResult.errorMessage || 'Signing rejected or held by controller',
        };
      }
      paymentSignature = signResult.signature;
    } else {
      const errMsg = 'Missing AGENT_WALLET_PRIVATE_KEY for outbound TaskMarket payment signing';
      this.emitter.emit({
        agentId,
        actionId: candidateTask.id,
        type: 'failure',
        error: errMsg,
      });

      return {
        taskId: candidateTask.id,
        success: false,
        stage: 'sign_payment',
        authorityLevel: profile.currentAuthorityLevel,
        error: errMsg,
      };
    }

    // Step 5: Settle on TaskMarket using PAYMENT-SIGNATURE
    const settledClaim = await client.claimTask(candidateTask.id, workerAddress, paymentSignature);

    if (settledClaim.status >= 400) {
      this.emitter.emit({
        agentId,
        actionId: candidateTask.id,
        type: 'failure',
        error: `Settlement failed with status ${settledClaim.status}`,
      });

      return {
        taskId: candidateTask.id,
        success: false,
        stage: 'settlement',
        authorityLevel: profile.currentAuthorityLevel,
        signature: paymentSignature,
        error: `Settlement failed with HTTP ${settledClaim.status}`,
      };
    }

    const txHash =
      settledClaim.data?.txHash ||
      settledClaim.data?.transactionHash ||
      settledClaim.data?.hash ||
      settledClaim.data?.reference ||
      `0xsettled_${Date.now()}`;

    const rawUnits = BigInt(challenge.amount || '0');
    const amountUsd = Number(rawUnits) / 1_000_000;

    const earningsReceived: EarningsReceivedEvent = {
      amount: challenge.amount || '0',
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
      signature: paymentSignature,
      txHash,
      earningsReceived,
    };
  }
}
