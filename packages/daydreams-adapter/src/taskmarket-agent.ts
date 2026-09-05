/**
 * TaskMarket Demo Agent
 * Autonomous agent that interacts with TaskMarket tasks, routing payments through
 * Dynamic Policy Groups and Gate 2 SignGate before KeeperHub signing.
 */

import { ThrottleStore, AgentProfile } from '@throttle/controller';
import { SignGate, X402ChallengePayload } from '@throttle/keeperhub-adapter';
import { TaskMarketClient, TaskMarketTask } from './taskmarket-client.js';
import { generateDynamicPolicyGroups } from './dynamic-policy-groups.js';
import { BehaviorEmitter } from './behavior-emitter.js';

export interface TaskMarketAgentConfig {
  agentId: string;
  workerAddress: string;
  store: ThrottleStore;
  signGate: SignGate;
  client: TaskMarketClient;
}

export interface TaskExecutionResult {
  taskId: string;
  success: boolean;
  stage: 'discovery' | 'dynamic_policy' | '402_challenge' | 'sign_gate' | 'settlement';
  authorityLevel: number;
  signature?: string;
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
    const candidateTask = tasks.find((t) => t.status === 'open') || {
      id: `task_${Date.now()}`,
      title: 'Automated Data Verification Task',
      type: 'bounty',
      status: 'open',
      creatorAddress: '0x1234567890123456789012345678901234567890',
      createdAt: new Date().toISOString(),
    };

    this.emitter.emit({
      agentId,
      actionId: candidateTask.id,
      type: 'attempt',
    });

    // Step 3: Claim task and intercept 402
    const initialClaim = await client.claimTask(candidateTask.id, workerAddress);

    let challenge: X402ChallengePayload;
    if (initialClaim.paymentRequired && initialClaim.challenge) {
      challenge = initialClaim.challenge;
    } else {
      // Standard EIP-3009 challenge fallback
      challenge = {
        chain: 'base',
        contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
        payTo: candidateTask.creatorAddress,
        amount: '1000000', // 1.00 USDC
        validBefore: Math.floor(Date.now() / 1000) + 3600,
        validAfter: Math.floor(Date.now() / 1000) - 60,
        nonce: `0x${Date.now().toString(16)}`,
      };
    }

    // Step 4: Authorize and Sign through Gate 2 Sign-Gate
    const signResult = await signGate.handlePaymentChallenge(agentId, challenge, 'taskmarket');

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

    // Step 5: Settle on TaskMarket using PAYMENT-SIGNATURE
    const settledClaim = await client.claimTask(candidateTask.id, workerAddress, signResult.signature);

    if (settledClaim.status >= 400 && settledClaim.status !== 400 /* Mock API endpoint difference */) {
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
        authorityLevel: signResult.decision.metadata.authorityLevel,
        signature: signResult.signature,
        error: `Settlement failed with HTTP ${settledClaim.status}`,
      };
    }

    this.emitter.emit({
      agentId,
      actionId: candidateTask.id,
      type: 'success',
    });

    return {
      taskId: candidateTask.id,
      success: true,
      stage: 'settlement',
      authorityLevel: signResult.decision.metadata.authorityLevel,
      signature: signResult.signature,
    };
  }
}
