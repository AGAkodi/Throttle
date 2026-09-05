/**
 * TaskMarket Raw-REST Client
 * Direct HTTP client interacting with api.taskmarket.dev (avoiding the opaque official CLI subprocess).
 * Handles task discovery, claim challenges, and payment challenge interception.
 */

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
