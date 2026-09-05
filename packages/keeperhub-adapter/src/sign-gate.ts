/**
 * Gate 2: Sign-Gate (The Fine-Grained Payment Gate)
 * Wraps POST /api/agentic-wallet/sign and intercepts real x402 payment challenges.
 * Evaluates the real amount, destination, chain, and nonce BEFORE requesting Turnkey signatures.
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

export interface X402ChallengePayload {
  chain: string;
  contract: string;
  payTo: string;
  amount: string; // raw units (e.g. "1000000" for 1 USDC on Base with 6 decimals)
  validBefore: number;
  validAfter: number;
  nonce: string;
  domain?: Record<string, unknown>;
}

export interface SignGateConfig {
  store: ThrottleStore;
  keeperHubBaseUrl: string;
  keeperHubHmacSecret: string;
  keeperHubSubOrgId: string;
  simulationMode?: boolean;
}

export interface SignGateResult {
  decision: SignGateDecision;
  signature?: string;
  status: 'signed' | 'held' | 'rejected' | 'error';
  errorMessage?: string;
}

export class SignGate {
  private config: SignGateConfig;

  constructor(config: SignGateConfig) {
    this.config = config;
  }

  /**
   * Generates KeeperHub HMAC authentication signature.
   */
  private generateHmac(method: string, pathname: string, bodyString: string, timestamp: string): string {
    const payload = `${timestamp}.${method.toUpperCase()}.${pathname}.${bodyString}`;
    return crypto.createHmac('sha256', this.config.keeperHubHmacSecret).update(payload).digest('hex');
  }

  /**
   * Evaluates the real 402 challenge through the Controller and authorizes/executes signing.
   */
  public async handlePaymentChallenge(
    agentId: string,
    challenge: X402ChallengePayload,
    protocol: string = 'taskmarket'
  ): Promise<SignGateResult> {
    const store = this.config.store;
    const profile = store.getAgent(agentId);

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

    // Parse real USD amount (Base USDC has 6 decimals)
    const rawUnits = BigInt(challenge.amount || '0');
    const amountUsd = Number(rawUnits) / 1_000_000;

    const proposedAction: ProposedAction = {
      id: `pay_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
      agentId,
      timestamp: Date.now(),
      type: 'payment',
      chain: challenge.chain || 'base',
      protocol,
      destination: challenge.payTo,
      amount: challenge.amount,
      amountUsd,
      tokenSymbol: 'USDC',
      metadata: {
        contract: challenge.contract,
        nonce: challenge.nonce,
        validBefore: challenge.validBefore,
        validAfter: challenge.validAfter,
      },
    };

    // Evaluate through Controller layers 1-5
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

    const signGateDecision = mapToSignGateDecision(decision);

    // Interception outcomes:
    if (signGateDecision.action === 'reject') {
      const record = createActionRecord(proposedAction, decision, 'rejected', undefined, decision.reason);
      store.saveActionRecord(record);
      return {
        decision: signGateDecision,
        status: 'rejected',
        errorMessage: decision.reason,
      };
    }

    if (signGateDecision.action === 'hold') {
      const record = createActionRecord(proposedAction, decision, 'pending', undefined, 'Held for human approval');
      store.saveActionRecord(record);
      return {
        decision: signGateDecision,
        status: 'held',
      };
    }

    // Proceed: dispatch to KeeperHub POST /api/agentic-wallet/sign
    try {
      const signature = await this.requestSignatureFromKeeperHub(challenge);
      const record = createActionRecord(proposedAction, decision, 'executed', signature);
      store.saveActionRecord(record);

      return {
        decision: signGateDecision,
        signature,
        status: 'signed',
      };
    } catch (err: any) {
      const record = createActionRecord(proposedAction, decision, 'failed', undefined, err.message);
      store.saveActionRecord(record);

      return {
        decision: signGateDecision,
        status: 'error',
        errorMessage: err.message,
      };
    }
  }

  /**
   * Calls KeeperHub /api/agentic-wallet/sign using HMAC authentication.
   */
  private async requestSignatureFromKeeperHub(challenge: X402ChallengePayload): Promise<string> {
    if (this.config.simulationMode || !this.config.keeperHubHmacSecret) {
      // Mock signature for local deterministic execution/test runs
      return '0x' + crypto.randomBytes(65).toString('hex');
    }

    const signEndpoint = '/api/agentic-wallet/sign';
    const url = `${this.config.keeperHubBaseUrl}${signEndpoint}`;
    const timestamp = Date.now().toString();

    const signPayload = {
      chain: challenge.chain || 'base',
      subOrgId: this.config.keeperHubSubOrgId,
      paymentChallenge: challenge,
    };

    const bodyString = JSON.stringify(signPayload);
    const hmac = this.generateHmac('POST', signEndpoint, bodyString, timestamp);

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-KeeperHub-Timestamp': timestamp,
        'X-KeeperHub-Signature': hmac,
        'X-KeeperHub-SubOrg': this.config.keeperHubSubOrgId,
      },
      body: bodyString,
    });

    if (!res.ok) {
      const errText = await res.text();
      throw new Error(`KeeperHub /sign returned HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    if (!data.signature) {
      throw new Error(`KeeperHub /sign did not return signature in response payload`);
    }

    return data.signature;
  }
}
