import dns from 'node:dns';
import { Agent, setGlobalDispatcher } from 'undici';

try {
  dns.setDefaultResultOrder('ipv4first');
  dns.setServers(['8.8.8.8', '1.1.1.1']);
} catch {}

try {
  setGlobalDispatcher(
    new Agent({
      connect: {
        timeout: 60_000,
        lookup: (hostname, opts, cb) => {
          dns.resolve4(hostname, (err, addrs) => {
            if (!err && addrs && addrs.length > 0) {
              if (opts && (opts as any).all) {
                return (cb as any)(null, addrs.map((a) => ({ address: a, family: 4 })));
              }
              return (cb as any)(null, addrs[0], 4);
            }
            return dns.lookup(hostname, opts, cb);
          });
        },
      },
      headersTimeout: 60_000,
      bodyTimeout: 60_000,
    })
  );
} catch {}

import crypto from 'node:crypto';
import { privateKeyToAccount } from 'viem/accounts';
import type { Hex } from 'viem';

/**
 * Confirmed outbound spend event emitted when the agent successfully
 * settles a TaskMarket claim fee via on-chain transaction.
 */
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

export interface X402ChallengeData {
  chain?: string;
  contract: string;
  payTo: string;
  amount: string;
  validBefore: number;
  validAfter: number;
  nonce: string;
  domain?: {
    name?: string;
    version?: string;
    chainId?: number;
    verifyingContract?: string;
  };
}

/**
 * Signs the canonical EIP-191 personal message for claiming a task on TaskMarket.
 * Canonical message format: "taskmarket:claim:<taskId>"
 */
export async function signClaimMessage(
  privateKey: string,
  taskId: string
): Promise<string> {
  const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(formattedKey);
  const signature = await account.signMessage({
    message: `taskmarket:claim:${taskId}`,
  });
  return signature;
}

/**
 * Signs EIP-3009 TransferWithAuthorization directly with the agent's operating wallet key.
 * Used for task creation / paid writes. Completely self-contained; does not invoke KeeperHub.
 */
export async function signTransferWithAuthorization(
  privateKey: string,
  challenge: X402ChallengeData
): Promise<string> {
  const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  const account = privateKeyToAccount(formattedKey);

  const chainId = challenge.domain?.chainId ?? (challenge.chain === 'base' ? 8453 : 8453);
  const verifyingContract = (challenge.contract || challenge.domain?.verifyingContract) as Hex;
  const rawNonce = challenge.nonce.startsWith('0x') ? challenge.nonce : `0x${challenge.nonce}`;
  const formattedNonce = (rawNonce.length === 66 ? rawNonce : rawNonce.padEnd(66, '0')) as Hex;

  const signature = await account.signTypedData({
    domain: {
      name: challenge.domain?.name ?? 'USD Coin',
      version: challenge.domain?.version ?? '2',
      chainId,
      verifyingContract,
    },
    types: {
      TransferWithAuthorization: [
        { name: 'from', type: 'address' },
        { name: 'to', type: 'address' },
        { name: 'value', type: 'uint256' },
        { name: 'validAfter', type: 'uint256' },
        { name: 'validBefore', type: 'uint256' },
        { name: 'nonce', type: 'bytes32' },
      ],
    },
    primaryType: 'TransferWithAuthorization',
    message: {
      from: account.address,
      to: challenge.payTo as Hex,
      value: BigInt(challenge.amount),
      validAfter: BigInt(challenge.validAfter),
      validBefore: BigInt(challenge.validBefore),
      nonce: formattedNonce,
    },
  });

  return signature;
}

export interface TaskMarketTask {
  id: string;
  title: string;
  description?: string;
  type: string;
  status: 'open' | 'claimed' | 'completed' | 'cancelled';
  mode?: 'claim' | 'bounty' | string;
  reward?: string;
  rewardUsd?: number;
  bountyUsd?: number;
  creatorAddress: string;
  createdAt: string;
}

export interface ClaimResult {
  status: number;
  success: boolean;
  claimId?: string;
  paymentRequired?: boolean;
  challenge?: any;
  error?: string;
  data?: any;
}

export class TaskMarketClient {
  private baseUrl: string;

  constructor(baseUrl: string = 'https://api.taskmarket.dev') {
    this.baseUrl = baseUrl.replace(/\/$/, '');
  }

  /**
   * Fetches open tasks available on TaskMarket.
   */
  public async listOpenTasks(): Promise<TaskMarketTask[]> {
    try {
      const res = await fetch(`${this.baseUrl}/api/tasks`, {
        headers: {
          'Accept': 'application/json',
        },
      });

      if (!res.ok) {
        return [];
      }

      const data = await res.json() as any;
      return Array.isArray(data) ? data : (data.tasks || []);
    } catch {
      return [];
    }
  }

  /**
   * Attempts to claim a task.
   * Sends canonical EIP-191 signature directly on the first call with idempotency key.
   * There is no 402 challenge handshake for /claim.
   */
  public async claimTask(
    taskId: string,
    workerAddress: string,
    signature: string
  ): Promise<ClaimResult> {
    const idempotencyKey = crypto.randomUUID();
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Taskmarket-Idempotency-Key': idempotencyKey,
    };

    try {
      const res = await fetch(`${this.baseUrl}/api/tasks/${taskId}/claim`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workerAddress,
          signature,
        }),
      });

      const body = (await res.json().catch(() => ({}))) as any;
      return {
        status: res.status,
        success: res.ok,
        claimId: body?.claimId,
        paymentRequired: res.status === 402,
        data: body,
        error: !res.ok ? (body?.message || `HTTP ${res.status}`) : undefined,
      };
    } catch (err: any) {
      return {
        status: 500,
        success: false,
        paymentRequired: false,
        error: err.message,
      };
    }
  }

  /**
   * Requests legal acceptance terms challenge for first-time wallet onboarding.
   */
  public async getLegalChallenge(address: string): Promise<{ challenge: string }> {
    const res = await fetch(`${this.baseUrl}/api/legal/challenge`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ address }),
    });
    return res.json() as Promise<{ challenge: string }>;
  }

  /**
   * Creates and settles a paid task on TaskMarket via the two-round EIP-3009/X402 handshake.
   * Round 1: POST /api/tasks (returns HTTP 402 challenge)
   * Signs EIP-3009 TransferWithAuthorization with privateKey
   * Round 2: POST /api/tasks with PAYMENT-SIGNATURE header (same idempotency key on BOTH rounds)
   * Resolves terminal on-chain txHash directly or polls GET /api/intents.
   */
  public async createAndSettleTask(params: CreateTaskParams): Promise<CreatedTaskResult> {
    const idempotencyKey = crypto.randomUUID();
    const formattedKey = (params.privateKey.startsWith('0x') ? params.privateKey : `0x${params.privateKey}`) as Hex;
    const account = privateKeyToAccount(formattedKey);
    const agentAddress = account.address;

    const taskPayload = {
      description: params.description || 'Autonomous claim task for Throttle dynamic autonomy pipeline verification',
      reward: params.reward,
      duration: params.duration ?? 86400,
      tags: params.tags ?? ['throttle-verification', 'claim-mode'],
      mode: params.mode ?? 'claim',
      taskVisibility: params.taskVisibility ?? 'public',
    };

    // Round 1: Initial POST expecting HTTP 402 Payment Required
    let initialRes: Response | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        initialRes = await fetch(`${this.baseUrl}/api/tasks`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'X-Taskmarket-Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify(taskPayload),
        });
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 2000));
          continue;
        }
        throw err;
      }
    }

    if (!initialRes) {
      throw lastErr || new Error('Failed to connect to TaskMarket for task creation');
    }

    if (initialRes.status !== 402) {
      const initialBody = await initialRes.json().catch(() => ({}));
      throw new Error(`Expected HTTP 402 challenge on task creation, received HTTP ${initialRes.status}: ${JSON.stringify(initialBody)}`);
    }

    const challengeData = (await initialRes.json()) as any;
    const acceptOption = challengeData.accepts?.[0];
    if (!acceptOption) {
      throw new Error(`Invalid 402 challenge received from TaskMarket (no accepts option): ${JSON.stringify(challengeData)}`);
    }

    // Sign EIP-3009 TransferWithAuthorization
    const chainId = acceptOption.network === 'base' ? 8453 : (acceptOption.extra?.chainId ?? 8453);
    const verifyingContract = (acceptOption.asset || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913') as Hex;
    const nowSec = Math.floor(Date.now() / 1000);
    const validAfter = 0n;
    const validBefore = BigInt(nowSec + (acceptOption.maxTimeoutSeconds || 300));
    const nonce = ('0x' + crypto.randomBytes(32).toString('hex')) as Hex;

    const signature = await account.signTypedData({
      domain: {
        name: acceptOption.extra?.name || 'USD Coin',
        version: acceptOption.extra?.version || '2',
        chainId,
        verifyingContract,
      },
      types: {
        TransferWithAuthorization: [
          { name: 'from', type: 'address' },
          { name: 'to', type: 'address' },
          { name: 'value', type: 'uint256' },
          { name: 'validAfter', type: 'uint256' },
          { name: 'validBefore', type: 'uint256' },
          { name: 'nonce', type: 'bytes32' },
        ],
      },
      primaryType: 'TransferWithAuthorization',
      message: {
        from: agentAddress,
        to: acceptOption.payTo as Hex,
        value: BigInt(acceptOption.amount),
        validAfter,
        validBefore,
        nonce,
      },
    });

    const paymentPayload = {
      x402Version: challengeData.x402Version || 2,
      resource: challengeData.resource,
      accepted: acceptOption,
      payload: {
        authorization: {
          from: agentAddress,
          to: acceptOption.payTo,
          value: acceptOption.amount,
          validAfter: validAfter.toString(),
          validBefore: validBefore.toString(),
          nonce,
        },
        signature,
      },
    };
    const base64Payment = Buffer.from(JSON.stringify(paymentPayload)).toString('base64');

    // Round 2: POST with PAYMENT-SIGNATURE and same idempotency key
    const createRes = await fetch(`${this.baseUrl}/api/tasks`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'X-Taskmarket-Idempotency-Key': idempotencyKey,
        'PAYMENT-SIGNATURE': base64Payment,
      },
      body: JSON.stringify(taskPayload),
    });

    if (createRes.status === 409) {
      // In-flight paid write: poll intent by idempotency key
      const pollResult = await this.waitForIntentTerminalByIdempotencyKey(idempotencyKey);
      return {
        taskId: pollResult.data.taskId,
        txHash: pollResult.txHash,
        intentId: pollResult.data.intentId,
        status: pollResult.status,
        rawResponse: pollResult.data,
      };
    }

    if (!createRes.ok) {
      const errBody = await createRes.json().catch(() => ({}));
      throw new Error(`Task creation settlement failed with HTTP ${createRes.status}: ${JSON.stringify(errBody)}`);
    }

    const createData = (await createRes.json()) as any;
    const taskId = createData.taskId;
    const intentId = createData.intentId;

    let txHash =
      createData.txHash ||
      createData.transactionHash ||
      createData.hash ||
      createData.escrowTxHash;

    if (!txHash) {
      const start = Date.now();
      const timeoutMs = 60000;
      const intervalMs = 2000;

      while (Date.now() - start < timeoutMs) {
        // 1. Try polling GET /api/intents
        if (intentId || idempotencyKey) {
          try {
            const intentQuery = intentId ? { intentId } : { idempotencyKey };
            const intent = await this.pollIntent(intentQuery);
            if (intent.status === 'completed' && intent.txHash) {
              txHash = intent.txHash;
              break;
            }
            if (intent.status === 'failed') {
              throw new Error(`Intent reached terminal state 'failed': ${intent.terminalReason || 'unknown'}`);
            }
          } catch (err: any) {
            if (err.message?.includes('reached terminal state')) throw err;
          }
        }

        // 2. Try polling task directly for escrowTxHash
        if (taskId) {
          try {
            const taskRes = await fetch(`${this.baseUrl}/api/tasks/${taskId}`, {
              headers: { Accept: 'application/json' },
            });
            if (taskRes.ok) {
              const taskObj = (await taskRes.json()) as any;
              if (taskObj.escrowTxHash) {
                txHash = taskObj.escrowTxHash;
                break;
              }
            }
          } catch {}

          // 3. Also check listOpenTasks
          try {
            const openTasks = await this.listOpenTasks();
            const found = openTasks.find((t: any) => t.id === taskId);
            if (found && (found as any).escrowTxHash) {
              txHash = (found as any).escrowTxHash;
              break;
            }
          } catch {}
        }

        await new Promise((resolve) => setTimeout(resolve, intervalMs));
      }
    }

    if (!txHash) {
      throw new Error(`Task creation succeeded (taskId: ${taskId}, intentId: ${intentId}) but no terminal on-chain txHash was confirmed within 60s. Refusing to fabricate one.`);
    }

    return {
      taskId,
      txHash,
      intentId,
      taskDropId: createData.taskDropId,
      status: 'created',
      rawResponse: createData,
    };
  }

  /**
   * Polls the intent status for a relayed write from GET /api/intents.
   */
  public async pollIntent(query: { intentId?: string; idempotencyKey?: string }): Promise<any> {
    const params = new URLSearchParams();
    if (query.intentId) params.append('intentId', query.intentId);
    if (query.idempotencyKey) params.append('idempotencyKey', query.idempotencyKey);

    const res = await fetch(`${this.baseUrl}/api/intents?${params.toString()}`, {
      headers: { Accept: 'application/json' },
    });
    if (!res.ok) {
      throw new Error(`Failed to query intent: HTTP ${res.status}`);
    }
    return res.json();
  }

  /**
   * Polls GET /api/intents?intentId=... until terminal state (completed or failed).
   */
  public async waitForIntentTerminal(
    intentId: string,
    timeoutMs = 60000,
    intervalMs = 2000
  ): Promise<{ txHash: string; status: string; data: any }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const intent = await this.pollIntent({ intentId });
        if (intent.status === 'completed' && intent.txHash) {
          return { txHash: intent.txHash, status: intent.status, data: intent };
        }
        if (intent.status === 'failed') {
          throw new Error(`Intent ${intentId} reached terminal state 'failed': ${intent.terminalReason || 'unknown'}`);
        }
      } catch (err: any) {
        if (err.message?.includes('reached terminal state')) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Intent ${intentId} did not reach terminal state within ${timeoutMs / 1000}s`);
  }

  /**
   * Polls GET /api/intents?idempotencyKey=... until terminal state (completed or failed).
   */
  public async waitForIntentTerminalByIdempotencyKey(
    idempotencyKey: string,
    timeoutMs = 60000,
    intervalMs = 2000
  ): Promise<{ txHash: string; status: string; data: any }> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      try {
        const intent = await this.pollIntent({ idempotencyKey });
        if (intent.status === 'completed' && intent.txHash) {
          return { txHash: intent.txHash, status: intent.status, data: intent };
        }
        if (intent.status === 'failed') {
          throw new Error(`Intent for idempotency key ${idempotencyKey} reached terminal state 'failed': ${intent.terminalReason || 'unknown'}`);
        }
      } catch (err: any) {
        if (err.message?.includes('reached terminal state')) throw err;
      }
      await new Promise((resolve) => setTimeout(resolve, intervalMs));
    }
    throw new Error(`Intent for idempotency key ${idempotencyKey} did not reach terminal state within ${timeoutMs / 1000}s`);
  }
}

export interface CreateTaskParams {
  reward: string; // atomic units, e.g. "10000" for 0.01 USDC
  mode?: 'claim' | 'bounty' | string;
  description?: string;
  duration?: number;
  tags?: string[];
  taskVisibility?: 'public' | 'unlisted' | 'private';
  privateKey: string;
}

export interface CreatedTaskResult {
  taskId: string;
  txHash: string;
  intentId: string;
  status: string;
  taskDropId?: string | null;
  rawResponse?: any;
}


