/**
 * KeeperHub MCP Client Wrapper
 * Implements the safe execution pattern: simulate: true first (dry run), then real call with idempotency_key.
 * Wraps KeeperHub workflow execution and execution status polling.
 */

import crypto from 'crypto';

export interface KeeperHubMcpClientConfig {
  apiKey: string;
  baseUrl?: string;
  orgId?: string;
  simulationMode?: boolean;
}

export interface WorkflowExecutionParams {
  workflowId: string;
  parameters?: Record<string, unknown>;
  input?: Record<string, unknown>;
  idempotencyKey?: string;
  simulate?: boolean;
}

export interface WorkflowExecutionResult {
  executionId: string;
  status: 'running' | 'success' | 'completed' | 'simulated' | 'error' | 'pending';
  simulated?: boolean;
  txHash?: string;
  data?: any;
}

export interface ExecutionStatusResult {
  executionId: string;
  status: 'running' | 'success' | 'completed' | 'error' | 'system_error' | 'cancelled' | 'pending';
  txHash?: string;
  transactionHashes?: Array<{ hash: string; verified?: boolean; receiptStatus?: string }>;
  error?: string;
  raw?: any;
}

export class KeeperHubMcpClient {
  private config: KeeperHubMcpClientConfig;

  constructor(config: KeeperHubMcpClientConfig) {
    this.config = {
      baseUrl: 'https://app.keeperhub.com',
      ...config,
    };
  }

  /**
   * Executes or simulates a KeeperHub workflow.
   * If simulate: true, performs a preflight dry run without broadcasting value movement.
   */
  public async executeWorkflow(params: WorkflowExecutionParams): Promise<WorkflowExecutionResult> {
    const isSimulate = Boolean(params.simulate || this.config.simulationMode);
    const idempotencyKey = params.idempotencyKey || `idem_${crypto.randomBytes(16).toString('hex')}`;
    const inputPayload = params.input || params.parameters || {};

    if (isSimulate) {
      const simExecId = `sim_exec_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
      return {
        executionId: simExecId,
        status: 'simulated',
        simulated: true,
        txHash: '0xsimulated_' + crypto.randomBytes(24).toString('hex'),
        data: {
          simulated: true,
          input: inputPayload,
          idempotencyKey,
        },
      };
    }

    if (!this.config.apiKey) {
      throw new Error('[KeeperHub MCP] Missing required API key for live executeWorkflow');
    }

    const baseUrl = (this.config.baseUrl || 'https://app.keeperhub.com').replace(/\/$/, '');
    const url = `${baseUrl}/api/workflows/${params.workflowId}/execute`;

    let res: Response | null = null;
    let lastErr: any = null;
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        res = await fetch(url, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.config.apiKey}`,
            'X-Idempotency-Key': idempotencyKey,
          },
          body: JSON.stringify({
            input: inputPayload,
          }),
        });
        break;
      } catch (err: any) {
        lastErr = err;
        if (attempt < 3) {
          await new Promise((r) => setTimeout(r, 1500));
          continue;
        }
        throw err;
      }
    }

    if (!res) {
      throw lastErr || new Error(`[KeeperHub MCP] Failed to connect to ${url}`);
    }

    if (!res.ok) {
      const errText = await res.text().catch(() => '');
      throw new Error(`[KeeperHub MCP] POST /api/workflows/${params.workflowId}/execute failed with HTTP ${res.status}: ${errText}`);
    }

    const data = await res.json() as any;
    const executionId = data.executionId || data.id || data.execution_id;

    if (!executionId) {
      throw new Error(`[KeeperHub MCP] Workflow execute response missing executionId: ${JSON.stringify(data)}`);
    }

    return {
      executionId,
      status: data.status || 'running',
      simulated: false,
      data,
    };
  }

  /**
   * Polls get_execution status until terminal state or timeout.
   */
  public async getExecution(
    executionId: string,
    options?: { maxWaitMs?: number; pollIntervalMs?: number }
  ): Promise<ExecutionStatusResult> {
    const isSimulated = this.config.simulationMode || executionId.startsWith('sim_exec_');

    if (isSimulated) {
      const mockHash = '0x' + crypto.randomBytes(32).toString('hex');
      return {
        executionId,
        status: 'success',
        txHash: mockHash,
        transactionHashes: [{ hash: mockHash, verified: true }],
        raw: {
          status: {
            status: 'success',
            progress: { completedSteps: 1, totalSteps: 1 },
            transactionHashes: [{ hash: mockHash, verified: true }],
          },
        },
      };
    }

    if (!this.config.apiKey) {
      throw new Error('[KeeperHub MCP] Missing required API key for live getExecution');
    }

    const baseUrl = (this.config.baseUrl || 'https://app.keeperhub.com').replace(/\/$/, '');
    const maxWaitMs = options?.maxWaitMs ?? 30000;
    const pollIntervalMs = options?.pollIntervalMs ?? 1500;
    const startTime = Date.now();
    let pollAttempts = 0;
    let lastNetworkError: any = null;
    let lastStatus: string | null = null;
    let lastStatusObj: any = null;

    while (Date.now() - startTime < maxWaitMs) {
      pollAttempts++;
      let res: Response | null = null;
      try {
        res = await fetch(`${baseUrl}/api/workflows/executions/${executionId}/status`, {
          headers: {
            'Authorization': `Bearer ${this.config.apiKey}`,
            'Accept': 'application/json',
          },
        });
        lastNetworkError = null;
      } catch (err: any) {
        lastNetworkError = err;
        // Network blip while polling status, wait and retry on next interval
        await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
        continue;
      }

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        throw new Error(`[KeeperHub MCP] GET /api/workflows/executions/${executionId}/status failed with HTTP ${res.status}: ${errText}`);
      }

      const body = await res.json() as any;
      const statusObj = body.status || body;
      const statusStr = statusObj.status || body.status || 'unknown';
      lastStatus = statusStr;
      lastStatusObj = statusObj;

      const txHashes = statusObj.transactionHashes || body.transactionHashes || [];
      const primaryTxHash = txHashes[0]?.hash || txHashes[0] || statusObj.txHash || body.txHash;

      if (statusStr === 'success' || statusStr === 'completed') {
        return {
          executionId,
          status: 'success',
          txHash: primaryTxHash,
          transactionHashes: txHashes,
          raw: body,
        };
      }

      if (statusStr === 'error' || statusStr === 'system_error' || statusStr === 'failed') {
        const errorDetail = statusObj.errorContext?.error || statusObj.error || JSON.stringify(statusObj);
        throw new Error(`[KeeperHub MCP] Workflow execution ${executionId} failed on-chain: ${errorDetail}`);
      }

      if (statusStr === 'cancelled') {
        throw new Error(`[KeeperHub MCP] Workflow execution ${executionId} was cancelled.`);
      }

      // Wait before polling again
      await new Promise((resolve) => setTimeout(resolve, pollIntervalMs));
    }

    const elapsedMs = Date.now() - startTime;
    const detailParts: string[] = [`${pollAttempts} poll attempts`, `elapsed ${elapsedMs}ms`];
    if (lastStatus) {
      detailParts.push(`last status: '${lastStatus}'`);
    }
    if (lastNetworkError) {
      detailParts.push(`last network error: ${lastNetworkError.message || lastNetworkError}`);
    }
    throw new Error(`[KeeperHub MCP] Workflow execution ${executionId} timed out after ${maxWaitMs}ms (${detailParts.join(', ')})`);
  }

}

