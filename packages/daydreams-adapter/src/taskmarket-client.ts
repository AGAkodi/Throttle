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
 * Signs EIP-3009 TransferWithAuthorization directly with the agent's operating wallet key.
 * Completely self-contained; does not invoke KeeperHub.
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
  rewardUsd?: number;
  bountyUsd?: number;
  creatorAddress: string;
  createdAt: string;
}

export interface ClaimResult {
  status: number;
  paymentRequired: boolean;
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
   * If payment is required (HTTP 402), returns the EIP-3009 payment challenge.
   */
  public async claimTask(
    taskId: string,
    workerAddress: string,
    paymentSignature?: string
  ): Promise<ClaimResult> {
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    };

    if (paymentSignature) {
      headers['PAYMENT-SIGNATURE'] = paymentSignature;
      headers['X-Payment-Signature'] = paymentSignature;
    }

    try {
      const res = await fetch(`${this.baseUrl}/api/tasks/${taskId}/claim`, {
        method: 'POST',
        headers,
        body: JSON.stringify({
          workerAddress,
          signature: paymentSignature || undefined,
        }),
      });

      if (res.status === 402) {
        const body = await res.json() as any;
        return {
          status: 402,
          paymentRequired: true,
          challenge: body.challenge || body,
        };
      }

      const body = await res.json().catch(() => ({}));
      return {
        status: res.status,
        paymentRequired: false,
        data: body,
      };
    } catch (err: any) {
      return {
        status: 500,
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
}
