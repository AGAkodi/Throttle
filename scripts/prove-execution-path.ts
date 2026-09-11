/**
 * Phase 1 Execution Path Spike Harness
 *
 * Verifies the end-to-end payment flow:
 * 1. Queries api.taskmarket.dev for open tasks
 * 2. Attempts a task claim to trigger the HTTP 402 Payment Required challenge
 * 3. Inspects and extracts the x402 challenge shape (EIP-3009 TransferWithAuthorization)
 * 4. Dispatches the challenge to KeeperHub's POST /api/agentic-wallet/sign using HMAC authentication
 * 5. Retries the TaskMarket claim with PAYMENT-SIGNATURE to verify settlement
 *
 * Usage:
 *   npx tsx scripts/prove-execution-path.ts               # Live mode (fails loudly on errors)
 *   npx tsx scripts/prove-execution-path.ts --simulate    # Explicit simulation/mock mode
 */

import crypto from 'crypto';
import 'dotenv/config';

interface TaskMarketTask {
  id: string;
  title?: string;
  type?: string;
  status: string;
  mode?: string;
  reward?: string;
  rewardUsd?: number;
  bountyUsd?: number;
}

interface X402Challenge {
  chain: string;
  contract: string;
  payTo: string;
  amount: string;
  validBefore: number;
  validAfter: number;
  nonce: string;
  domain?: {
    name: string;
    version: string;
    chainId: number;
    verifyingContract: string;
  };
}

const IS_SIMULATE = process.argv.includes('--simulate');
const TASKMARKET_BASE_URL = (process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev').replace(/\/$/, '');
const KEEPERHUB_BASE_URL = (process.env.KEEPERHUB_BASE_URL || 'https://app.keeperhub.com').replace(/\/$/, '');
const KEEPERHUB_HMAC_SECRET = process.env.KEEPERHUB_HMAC_SECRET || '';
const KEEPERHUB_SUB_ORG_ID = process.env.KEEPERHUB_SUB_ORG_ID || '';
const WORKER_ADDRESS = process.env.KEEPERHUB_WALLET_ADDRESS || '0x1A3B27f02835ef31AEB1f59C4f003233147Bfdc5';

/**
 * Builds KeeperHub HMAC authentication headers.
 * Signing string format: `${method}\n${path}\n${subOrgId}\n${bodyDigest}\n${timestamp}`
 * where timestamp is in seconds and bodyDigest is SHA-256 hex of body.
 */
function buildKeeperHubHmacHeaders(
  secret: string,
  method: string,
  path: string,
  subOrgId: string,
  bodyString: string
): Record<string, string> {
  const timestamp = String(Math.floor(Date.now() / 1000));
  const bodyDigest = crypto.createHash('sha256').update(bodyString).digest('hex');
  const signingString = `${method.toUpperCase()}\n${path}\n${subOrgId}\n${bodyDigest}\n${timestamp}`;
  const signature = crypto.createHmac('sha256', secret).update(signingString).digest('hex');

  return {
    'Content-Type': 'application/json',
    'X-KH-Sub-Org': subOrgId,
    'X-KH-Timestamp': timestamp,
    'X-KH-Signature': signature,
    // Backwards-compatibility headers
    'X-KeeperHub-SubOrg': subOrgId,
    'X-KeeperHub-Timestamp': timestamp,
    'X-KeeperHub-Signature': signature,
  };
}

async function listOpenTasks(): Promise<TaskMarketTask[]> {
  console.log(`[TaskMarket] Fetching open tasks from ${TASKMARKET_BASE_URL}/api/tasks...`);

  if (IS_SIMULATE) {
    console.log('[TaskMarket] [SIMULATION] Using simulated open task.');
    return [
      {
        id: 'simulated-task-001',
        title: 'Simulated Data Verification Task',
        status: 'open',
        mode: 'claim',
      },
    ];
  }

  let res: Response;
  try {
    res = await fetch(`${TASKMARKET_BASE_URL}/api/tasks`, {
      headers: {
        Accept: 'application/json',
      },
    });
  } catch (error: any) {
    console.error(`\n[FATAL] Cannot connect to TaskMarket API at ${TASKMARKET_BASE_URL}: ${error.message}`);
    process.exit(1);
  }

  if (!res.ok) {
    console.error(`\n[FATAL] TaskMarket /api/tasks returned HTTP ${res.status}: ${res.statusText}`);
    process.exit(1);
  }

  let data: any;
  try {
    data = await res.json();
  } catch (err: any) {
    console.error(`\n[FATAL] TaskMarket /api/tasks returned unparseable response: ${err.message}`);
    process.exit(1);
  }

  const tasks: TaskMarketTask[] = Array.isArray(data) ? data : (data?.tasks || []);
  if (!Array.isArray(tasks)) {
    console.error(`\n[FATAL] TaskMarket /api/tasks returned unexpected response shape (missing tasks array):`, data);
    process.exit(1);
  }

  const openTasks = tasks.filter((t) => t.status === 'open');
  console.log(`[TaskMarket] Found ${tasks.length} total tasks (${openTasks.length} open).`);

  if (openTasks.length === 0) {
    console.error(`\n[FATAL] No open tasks available on TaskMarket (all ${tasks.length} tasks are closed/completed).`);
    process.exit(1);
  }

  return openTasks;
}

async function triggerClaimChallenge(taskId: string): Promise<{ status: number; challenge: X402Challenge; rawBody: any }> {
  console.log(`[TaskMarket] Attempting claim on task ${taskId} to inspect 402 challenge...`);

  if (IS_SIMULATE) {
    console.log('[TaskMarket] [SIMULATION] Emulating standard EIP-3009 402 challenge...');
    const mockChallenge: X402Challenge = {
      chain: 'base',
      contract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      payTo: '0x1234567890123456789012345678901234567890',
      amount: '1000000', // 1.00 USDC
      validAfter: Math.floor(Date.now() / 1000) - 60,
      validBefore: Math.floor(Date.now() / 1000) + 300,
      nonce: '0x' + crypto.randomBytes(32).toString('hex'),
      domain: {
        name: 'USD Coin',
        version: '2',
        chainId: 8453,
        verifyingContract: '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
      },
    };
    return {
      status: 402,
      challenge: mockChallenge,
      rawBody: { error: 'Payment Required', challenge: mockChallenge },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${TASKMARKET_BASE_URL}/api/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
      },
      body: JSON.stringify({
        workerAddress: WORKER_ADDRESS,
      }),
    });
  } catch (error: any) {
    console.error(`\n[FATAL] Network error during claim attempt on task ${taskId}: ${error.message}`);
    process.exit(1);
  }

  const bodyText = await res.text();
  let parsedBody: any;
  try {
    parsedBody = JSON.parse(bodyText);
  } catch {
    parsedBody = bodyText;
  }

  console.log(`[TaskMarket Response] HTTP Status: ${res.status}`);
  console.log(`[TaskMarket Response Payload]:`, JSON.stringify(parsedBody, null, 2));

  if (res.status !== 402) {
    console.error(`\n[FATAL] Expected HTTP 402 Payment Required challenge, but received HTTP ${res.status}.`);
    console.error(`Response details:`, JSON.stringify(parsedBody, null, 2));
    process.exit(1);
  }

  const rawChallenge = parsedBody?.challenge || parsedBody;
  if (!rawChallenge || !rawChallenge.payTo || !rawChallenge.amount) {
    console.error(`\n[FATAL] HTTP 402 response did not contain a valid payment challenge payload:`, parsedBody);
    process.exit(1);
  }

  const challenge: X402Challenge = {
    chain: rawChallenge.chain || 'base',
    contract: rawChallenge.contract || '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',
    payTo: rawChallenge.payTo,
    amount: rawChallenge.amount,
    validAfter: rawChallenge.validAfter || Math.floor(Date.now() / 1000) - 60,
    validBefore: rawChallenge.validBefore || Math.floor(Date.now() / 1000) + 300,
    nonce: rawChallenge.nonce || ('0x' + crypto.randomBytes(32).toString('hex')),
    domain: rawChallenge.domain,
  };

  return {
    status: res.status,
    challenge,
    rawBody: parsedBody,
  };
}

async function callKeeperHubSign(challenge: X402Challenge): Promise<{ signature: string; raw: any }> {
  const signEndpoint = '/api/agentic-wallet/sign';
  const url = `${KEEPERHUB_BASE_URL}${signEndpoint}`;

  if (IS_SIMULATE) {
    console.log('[KeeperHub /sign] [SIMULATION] Generating mock EIP-3009 signature...');
    console.log('[KeeperHub /sign] Verified challenge shape:');
    console.log(`  - Chain: ${challenge.chain}`);
    console.log(`  - Contract: ${challenge.contract}`);
    console.log(`  - PayTo: ${challenge.payTo}`);
    console.log(`  - Amount: ${challenge.amount}`);
    console.log(`  - Nonce: ${challenge.nonce}`);

    const mockSig = '0x' + crypto.randomBytes(65).toString('hex');
    return {
      signature: mockSig,
      raw: {
        status: 'success',
        signature: mockSig,
        signedAt: new Date().toISOString(),
        simulation: true,
      },
    };
  }

  // Live checks
  if (!KEEPERHUB_HMAC_SECRET) {
    console.error('\n[FATAL] Missing KEEPERHUB_HMAC_SECRET environment variable.');
    console.error('KeeperHub live signing requires KEEPERHUB_HMAC_SECRET.');
    process.exit(1);
  }

  if (!KEEPERHUB_SUB_ORG_ID) {
    console.error('\n[FATAL] Missing KEEPERHUB_SUB_ORG_ID environment variable.');
    console.error('KeeperHub live signing requires KEEPERHUB_SUB_ORG_ID.');
    process.exit(1);
  }

  const signPayload = {
    chain: challenge.chain || 'base',
    subOrgId: KEEPERHUB_SUB_ORG_ID,
    paymentChallenge: challenge,
  };

  const bodyString = JSON.stringify(signPayload);
  const headers = buildKeeperHubHmacHeaders(
    KEEPERHUB_HMAC_SECRET,
    'POST',
    signEndpoint,
    KEEPERHUB_SUB_ORG_ID,
    bodyString
  );

  console.log(`[KeeperHub /sign] Calling ${url} with HMAC...`);
  let res: Response;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers,
      body: bodyString,
    });
  } catch (error: any) {
    console.error(`\n[FATAL] Network error connecting to KeeperHub /sign: ${error.message}`);
    process.exit(1);
  }

  const bodyText = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = bodyText;
  }

  console.log(`[KeeperHub Result] HTTP ${res.status}:`, JSON.stringify(parsed, null, 2));

  if (!res.ok) {
    console.error(`\n[FATAL] KeeperHub /sign failed with HTTP ${res.status}:`, parsed);
    process.exit(1);
  }

  if (!parsed?.signature) {
    console.error(`\n[FATAL] KeeperHub /sign returned HTTP 200 but did not contain a signature:`, parsed);
    process.exit(1);
  }

  return {
    signature: parsed.signature,
    raw: parsed,
  };
}

async function settleTaskMarketClaim(
  taskId: string,
  signature: string
): Promise<{ success: boolean; status: number; txHash?: string; data: any }> {
  console.log(`\n[TaskMarket] Submitting settlement claim for task ${taskId} with PAYMENT-SIGNATURE...`);

  if (IS_SIMULATE) {
    console.log('[TaskMarket] [SIMULATION] Emulating settlement response...');
    return {
      success: true,
      status: 200,
      txHash: '0x' + crypto.randomBytes(32).toString('hex'),
      data: {
        status: 'claimed',
        message: 'Claim settled (simulation)',
        txHash: '0x' + crypto.randomBytes(32).toString('hex'),
      },
    };
  }

  let res: Response;
  try {
    res = await fetch(`${TASKMARKET_BASE_URL}/api/tasks/${taskId}/claim`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        'PAYMENT-SIGNATURE': signature,
        'X-Payment-Signature': signature,
      },
      body: JSON.stringify({
        workerAddress: WORKER_ADDRESS,
        signature,
      }),
    });
  } catch (error: any) {
    console.error(`\n[FATAL] Network error during settlement claim on task ${taskId}: ${error.message}`);
    process.exit(1);
  }

  const bodyText = await res.text();
  let parsed: any;
  try {
    parsed = JSON.parse(bodyText);
  } catch {
    parsed = bodyText;
  }

  console.log(`[TaskMarket Settlement] HTTP ${res.status}:`, JSON.stringify(parsed, null, 2));

  if (!res.ok) {
    console.error(`\n[FATAL] TaskMarket claim settlement failed with HTTP ${res.status}:`, parsed);
    process.exit(1);
  }

  const txHash =
    parsed?.txHash ||
    parsed?.transactionHash ||
    parsed?.hash ||
    parsed?.data?.txHash ||
    parsed?.data?.hash ||
    parsed?.reference ||
    parsed?.claimId;

  return {
    success: true,
    status: res.status,
    txHash,
    data: parsed,
  };
}

async function main() {
  console.log('================================================================');
  console.log('THROTTLE PHASE 1: EXECUTION PATH SPIKE HARNESS');
  console.log('================================================================');

  if (IS_SIMULATE) {
    console.log('\n****************************************************************');
    console.log('*              SIMULATION MODE — NOT A REAL PROOF              *');
    console.log('****************************************************************\n');
  } else {
    console.log('[Mode] Live network execution (Failures are loud and non-zero)\n');

    if (!KEEPERHUB_HMAC_SECRET) {
      console.error('[FATAL] Missing required environment variable: KEEPERHUB_HMAC_SECRET');
      console.error('KeeperHub live signing requires KEEPERHUB_HMAC_SECRET. Use --simulate for mock mode.');
      process.exit(1);
    }

    if (!KEEPERHUB_SUB_ORG_ID) {
      console.error('[FATAL] Missing required environment variable: KEEPERHUB_SUB_ORG_ID');
      console.error('KeeperHub live signing requires KEEPERHUB_SUB_ORG_ID. Use --simulate for mock mode.');
      process.exit(1);
    }
  }

  // Step 1: List open tasks
  const openTasks = await listOpenTasks();
  const targetTask = openTasks[0];
  console.log(`[Execution] Selected task: ${targetTask.id} ("${targetTask.title || targetTask.id}")\n`);

  // Step 2: Trigger 402 challenge
  const challengeResult = await triggerClaimChallenge(targetTask.id);

  // Step 3: Sign challenge via KeeperHub
  console.log('\n[KeeperHub] Submitting challenge to /api/agentic-wallet/sign...');
  const signResult = await callKeeperHubSign(challengeResult.challenge);

  // Step 4: Complete the loop by settling on TaskMarket
  const settlementResult = await settleTaskMarketClaim(targetTask.id, signResult.signature);

  if (IS_SIMULATE) {
    console.log('\n================================================================');
    console.log('[SIMULATION COMPLETE] Simulated execution loop finished.');
    console.log('Notice: Simulation mode does NOT constitute a real on-chain proof.');
    console.log(`Simulated Signature: ${signResult.signature.slice(0, 22)}...`);
    console.log(`Simulated TxHash:    ${settlementResult.txHash}`);
    console.log('================================================================');
  } else {
    console.log('\n================================================================');
    console.log('[SUCCESS] Execution path verified!');
    console.log(`Signature:        ${signResult.signature}`);
    console.log(`Transaction Hash: ${settlementResult.txHash || 'None returned by endpoint'}`);
    console.log('Full round-trip claim, sign, and settlement completed against live APIs.');
    console.log('================================================================');
  }
}

main().catch((err) => {
  console.error('\n[FATAL] Unhandled error in prove-execution-path:', err.message || err);
  process.exit(1);
});
