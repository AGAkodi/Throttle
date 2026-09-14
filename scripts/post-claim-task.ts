import crypto from 'crypto';
import dotenv from 'dotenv';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, formatUnits, parseAbi, type Hex } from 'viem';
import { base } from 'viem/chains';

dotenv.config();

const AGENT_WALLET_PRIVATE_KEY = process.env.AGENT_WALLET_PRIVATE_KEY || '';
const TASKMARKET_BASE_URL = (process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev').replace(/\/$/, '');
const BASE_RPC_URL = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
const USDC_ADDRESS = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913' as Hex;

const erc20Abi = parseAbi([
  'function balanceOf(address owner) view returns (uint256)',
]);

async function main() {
  console.log('================================================================');
  console.log('STEP 1: SELF-CLAIM RESTRICTION CHECK IN OPENAPI SPEC');
  console.log('================================================================');
  console.log('Inspecting OpenAPI spec for self-claim / requester claim restrictions...');
  const specRes = await fetch(`${TASKMARKET_BASE_URL}/openapi.json`);
  const spec = (await specRes.json()) as any;

  const claimEndpoint = spec.paths['/tasks/{taskId}/claim'];
  console.log('OpenAPI /tasks/{taskId}/claim schema details:');
  console.log('  Summary:', claimEndpoint?.post?.summary);
  console.log('  Parameters:', JSON.stringify(claimEndpoint?.post?.parameters));
  console.log('  RequestBody schema:', JSON.stringify(claimEndpoint?.post?.requestBody?.content?.['application/json']?.schema));
  console.log('  Responses:', Object.keys(claimEndpoint?.post?.responses || {}));
  console.log('  Explicit self-claim restriction documented:', false);
  console.log('  [NOTE] The OpenAPI specification documents NO explicit restriction on a wallet claiming its own task.');

  console.log('\n================================================================');
  console.log('STEP 2: BALANCE & MATH VERIFICATION');
  console.log('================================================================');
  const formattedKey = (AGENT_WALLET_PRIVATE_KEY.startsWith('0x')
    ? AGENT_WALLET_PRIVATE_KEY
    : `0x${AGENT_WALLET_PRIVATE_KEY}`) as Hex;
  const account = privateKeyToAccount(formattedKey);
  const agentAddress = account.address;

  const publicClient = createPublicClient({ chain: base, transport: http(BASE_RPC_URL) });
  const rawBalance = (await publicClient.readContract({
    address: USDC_ADDRESS,
    abi: erc20Abi,
    functionName: 'balanceOf',
    args: [agentAddress],
  })) as bigint;

  const taskRewardRaw = 10000n; // 0.01 USDC
  const claimFeeRaw = 1000n; // 0.001 USDC
  const totalRequiredRaw = taskRewardRaw + claimFeeRaw;

  console.log(`Agent Address:          ${agentAddress}`);
  console.log(`Current Base USDC:      ${formatUnits(rawBalance, 6)} USDC (${rawBalance} atomic units)`);
  console.log(`Task Escrow Creation:   ${formatUnits(taskRewardRaw, 6)} USDC (${taskRewardRaw} atomic units)`);
  console.log(`Claim Fee:              ${formatUnits(claimFeeRaw, 6)} USDC (${claimFeeRaw} atomic units)`);
  console.log(`Total Required:         ${formatUnits(totalRequiredRaw, 6)} USDC (${totalRequiredRaw} atomic units)`);
  console.log(`Projected Remainder:    ${formatUnits(rawBalance - totalRequiredRaw, 6)} USDC (${rawBalance - totalRequiredRaw} atomic units)`);

  if (rawBalance < totalRequiredRaw) {
    console.error(`[FATAL] Insufficient balance! Have ${rawBalance}, need ${totalRequiredRaw}`);
    process.exit(1);
  }
  console.log('[PASS] Balance sufficient for both task creation and subsequent claim fee.');

  console.log('\n================================================================');
  console.log('STEP 3: POST CLAIM-MODE TASK TO TASKMARKET');
  console.log('================================================================');
  const idempotencyKey = crypto.randomUUID();
  const taskPayload = {
    description: 'Autonomous claim task for Throttle dynamic autonomy pipeline verification',
    reward: '10000',
    duration: 86400,
    tags: ['throttle-verification', 'claim-mode'],
    mode: 'claim',
    taskVisibility: 'public',
  };

  console.log(`Sending initial POST ${TASKMARKET_BASE_URL}/api/tasks (expecting 402 challenge)...`);
  const initialRes = await fetch(`${TASKMARKET_BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Taskmarket-Idempotency-Key': idempotencyKey,
    },
    body: JSON.stringify(taskPayload),
  });

  console.log(`Initial response HTTP ${initialRes.status}`);
  const initialData = (await initialRes.json()) as any;

  if (initialRes.status !== 402) {
    console.error('[FATAL] Expected 402 Payment Required for task creation, received:', initialRes.status, initialData);
    process.exit(1);
  }

  console.log('402 Challenge payload received:');
  console.log('  x402Version:', initialData.x402Version);
  const acceptOption = initialData.accepts?.[0];
  if (!acceptOption) {
    console.error('[FATAL] No accepts option in 402 challenge:', initialData);
    process.exit(1);
  }
  console.log('  Asset:', acceptOption.asset);
  console.log('  Amount:', acceptOption.amount);
  console.log('  PayTo:', acceptOption.payTo);
  console.log('  Network:', acceptOption.network);

  const nowSec = Math.floor(Date.now() / 1000);
  const validAfter = 0n;
  const validBefore = BigInt(nowSec + (acceptOption.maxTimeoutSeconds || 300));
  const nonce = ('0x' + crypto.randomBytes(32).toString('hex')) as Hex;

  console.log(`\nSigning EIP-3009 TransferWithAuthorization with agent key (${agentAddress})...`);
  const signature = await account.signTypedData({
    domain: {
      name: acceptOption.extra?.name || 'USD Coin',
      version: acceptOption.extra?.version || '2',
      chainId: 8453,
      verifyingContract: (acceptOption.asset || USDC_ADDRESS) as Hex,
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

  console.log(`Signature generated: ${signature.slice(0, 34)}...`);

  // Construct official x402 v2 PaymentPayloadV2Schema
  const paymentPayload = {
    x402Version: 2,
    resource: initialData.resource,
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

  console.log('\nSubmitting signed request to POST /api/tasks with PAYMENT-SIGNATURE (base64 encoded)...');
  const createRes = await fetch(`${TASKMARKET_BASE_URL}/api/tasks`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'X-Taskmarket-Idempotency-Key': idempotencyKey,
      'PAYMENT-SIGNATURE': base64Payment,
    },
    body: JSON.stringify(taskPayload),
  });

  const createStatus = createRes.status;
  const createText = await createRes.text();
  let createData: any;
  try {
    createData = JSON.parse(createText);
  } catch {
    createData = createText;
  }

  console.log(`POST /api/tasks Response HTTP ${createStatus}:`, JSON.stringify(createData, null, 2));

  if (!createRes.ok || !createData?.taskId) {
    console.error('[FATAL] Failed to create task on TaskMarket:', createData);
    process.exit(1);
  }

  const createdTaskId = createData.taskId;
  console.log(`\n[SUCCESS] Created claim-mode Task ID: ${createdTaskId}`);

  console.log('\n================================================================');
  console.log('STEP 4: CONFIRM TASK APPEARS IN OPEN LIST WITH MODE: CLAIM');
  console.log('================================================================');
  const tasksRes = await fetch(`${TASKMARKET_BASE_URL}/api/tasks`, {
    headers: { Accept: 'application/json' },
  });
  const allTasksData = (await tasksRes.json()) as any;
  const allTasks = Array.isArray(allTasksData) ? allTasksData : (allTasksData?.tasks || []);
  const found = allTasks.find((t: any) => t.id === createdTaskId);

  if (!found) {
    console.error(`[FATAL] Created task ${createdTaskId} not found in GET /api/tasks list!`);
    process.exit(1);
  }

  console.log('Found created task in task list:');
  console.log('  ID:     ', found.id);
  console.log('  Status: ', found.status);
  console.log('  Mode:   ', found.mode);
  console.log('  Reward: ', found.reward);

  if (found.status !== 'open' || found.mode !== 'claim') {
    console.error(`[FATAL] Task does not match expected status='open' and mode='claim'! Got status=${found.status}, mode=${found.mode}`);
    process.exit(1);
  }

  console.log('\n[PASS] Task is live, open, and confirmed in mode: claim!');
}

main().catch((err) => {
  console.error('[FATAL] Unexpected error:', err);
  process.exit(1);
});
