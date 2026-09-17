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

import crypto from 'crypto';
import 'dotenv/config';
import { privateKeyToAccount } from 'viem/accounts';
import { createPublicClient, http, parseAbiItem, decodeEventLog } from 'viem';
import type { Hex } from 'viem';
import { base } from 'viem/chains';
import { ThrottleStore, createDefaultProfile, AuthorityLevel } from '@throttle/controller';
import { SweepGate, ConfirmedSpendEvent } from '@throttle/keeperhub-adapter';
import {
  TaskMarketClient,
  TaskMarketAgent,
  CreateTaskParams,
  CreatedTaskResult,
} from '@throttle/daydreams-adapter';

const IS_SIMULATE = process.argv.includes('--simulate');
const TASKMARKET_BASE_URL = (process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev').replace(/\/$/, '');
const KEEPERHUB_BASE_URL = (process.env.KEEPERHUB_BASE_URL || 'https://app.keeperhub.com').replace(/\/$/, '');
const KEEPERHUB_API_KEY = process.env.KEEPERHUB_API_KEY || '';
const KEEPERHUB_SWEEP_WORKFLOW_ID = process.env.KEEPERHUB_SWEEP_WORKFLOW_ID || 'wf-treasury-sweep-01';
const AGENT_WALLET_PRIVATE_KEY = process.env.AGENT_WALLET_PRIVATE_KEY || '';
const TREASURY_ADDRESS = process.env.THROTTLE_TREASURY_ADDRESS || process.env.TREASURY_ADDRESS || '';
if (!TREASURY_ADDRESS) {
  console.error('[FATAL] THROTTLE_TREASURY_ADDRESS is missing from environment. Refusing to default to generic placeholder.');
  process.exit(1);
}

function getAgentAddress(privateKey: string): string {
  if (!privateKey) return '0x1A3B27f02835ef31AEB1f59C4f003233147Bfdc5';
  const formattedKey = (privateKey.startsWith('0x') ? privateKey : `0x${privateKey}`) as Hex;
  return privateKeyToAccount(formattedKey).address;
}

const WORKER_ADDRESS = process.env.AGENT_WORKER_ADDRESS || getAgentAddress(AGENT_WALLET_PRIVATE_KEY);

async function main() {
  console.log('================================================================');
  console.log('THROTTLE: TWO-LEG EXECUTION PATH SPIKE HARNESS');
  console.log('================================================================');

  if (IS_SIMULATE) {
    console.log('\n****************************************************************');
    console.log('*              SIMULATION MODE — NOT A REAL PROOF              *');
    console.log('****************************************************************\n');
  } else {
    console.log('[Mode] Live network execution (Failures are loud and non-zero)\n');

    if (!AGENT_WALLET_PRIVATE_KEY) {
      console.error('[FATAL] Missing required environment variable: AGENT_WALLET_PRIVATE_KEY');
      console.error('Leg 1 task creation requires AGENT_WALLET_PRIVATE_KEY. Use --simulate for mock mode.');
      process.exit(1);
    }

    if (!KEEPERHUB_API_KEY) {
      console.error('[FATAL] Missing required environment variable: KEEPERHUB_API_KEY');
      console.error('Leg 2 sweep requires KEEPERHUB_API_KEY. Use --simulate for mock mode.');
      process.exit(1);
    }
  }

  console.log(`[Signer] Agent Address: ${WORKER_ADDRESS}`);

  // --------------------------------------------------------------------------
  // LEG 1: TaskMarket Task Creation, X402 Payment Challenge, and Settlement
  // --------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('LEG 1: TASKMARKET TASK CREATION SETTLEMENT (AGENT-SIGNED X402)');
  console.log('----------------------------------------------------------------');

  const dbPath = process.env.CONTROLLER_DB_PATH || './data/throttle.sqlite';
  const store = new ThrottleStore(dbPath);
  let agentProfile = store.getAgent('agent-spike-runner');
  if (!agentProfile) {
    agentProfile = createDefaultProfile('agent-spike-runner', 'Daydreams Agent Alpha (Spike Runner)');
    store.saveAgent(agentProfile);
  }

  let client: TaskMarketClient;
  if (IS_SIMULATE) {
    class SimulatedTaskMarketClient extends TaskMarketClient {
      public override async createAndSettleTask(_params: CreateTaskParams): Promise<CreatedTaskResult> {
        const mockHash = '0x' + crypto.randomBytes(32).toString('hex');
        const mockTaskId = '0x' + crypto.randomBytes(32).toString('hex');
        const mockIntentId = 'intent-sim-' + crypto.randomUUID();
        return {
          taskId: mockTaskId,
          txHash: mockHash,
          intentId: mockIntentId,
          status: 'created',
          rawResponse: { success: true, taskId: mockTaskId, intentId: mockIntentId },
        };
      }
    }
    client = new SimulatedTaskMarketClient(TASKMARKET_BASE_URL);
  } else {
    client = new TaskMarketClient(TASKMARKET_BASE_URL);
  }

  const agent = new TaskMarketAgent({
    agentId: 'agent-spike-runner',
    workerAddress: WORKER_ADDRESS,
    store,
    client,
    agentPrivateKey: AGENT_WALLET_PRIVATE_KEY,
  });

  console.log('[Execution] Executing runTaskCreationCycle on TaskMarket...');
  console.log('  - Task Reward: 0.01 USDC (10,000 raw units)');
  console.log('  - Task Mode:   claim');

  const creationResult = await agent.runTaskCreationCycle({
    reward: '10000',
    description: 'Autonomous claim task for Throttle dynamic autonomy pipeline verification',
    mode: 'claim',
    tags: ['throttle-verification', 'claim-mode'],
  });

  if (!creationResult.success || !creationResult.confirmedSpend) {
    console.error(`\n[FATAL] Leg 1 TaskMarket task creation settlement failed: ${creationResult.error}`);
    process.exit(1);
  }

  const spendEvent: ConfirmedSpendEvent = creationResult.confirmedSpend;
  spendEvent.recipientAddress = TREASURY_ADDRESS;

  console.log('\n----------------------------------------------------------------');
  console.log('TRIGGER: ConfirmedSpend Event Emitted (Task Creation Escrow Payment)');
  console.log('----------------------------------------------------------------');
  console.log(`  - Amount:     $${spendEvent.amountUsd.toFixed(2)} (${spendEvent.amount} raw units)`);
  console.log(`  - Settlement: ${spendEvent.txHash}`);
  console.log(`  - Task ID:    ${spendEvent.taskId}`);
  console.log(`  - Intent ID:  ${creationResult.intentId}`);
  console.log(`  - Treasury:   ${TREASURY_ADDRESS}`);

  // --------------------------------------------------------------------------
  // LEG 2: Throttle Gate Evaluation & KeeperHub-Executed Treasury Sweep
  // --------------------------------------------------------------------------
  console.log('\n----------------------------------------------------------------');
  console.log('LEG 2: THROTTLE CONTROLLER & KEEPERHUB TREASURY SWEEP');
  console.log('----------------------------------------------------------------');

  const sweepGate = new SweepGate({
    store,
    keeperHubApiKey: KEEPERHUB_API_KEY,
    keeperHubBaseUrl: KEEPERHUB_BASE_URL,
    sweepWorkflowId: KEEPERHUB_SWEEP_WORKFLOW_ID,
    treasuryAddress: TREASURY_ADDRESS,
    simulationMode: IS_SIMULATE,
  });

  console.log('[Throttle Controller] Evaluating sweep action against policy, risk, drift, trust, and authority...');
  const sweepResult = await sweepGate.handleConfirmedSpend(
    'agent-spike-runner',
    spendEvent,
    TREASURY_ADDRESS
  );

  console.log(`[Controller Decision] Action: ${sweepResult.decision.action.toUpperCase()}`);
  console.log(`  - Authority Level: ${sweepResult.decision.metadata.authorityLevelName}`);
  console.log(`  - Risk Score:      ${sweepResult.decision.metadata.riskScore}/100`);
  console.log(`  - Trust Score:     ${sweepResult.decision.metadata.trustScore.toFixed(1)}/100`);
  console.log(`  - Drift Detected:  ${sweepResult.decision.metadata.driftDetected}`);

  if (sweepResult.status !== 'executed') {
    console.error(`\n[FATAL] SweepGate did not execute sweep. Status: ${sweepResult.status}. Error: ${sweepResult.errorMessage}`);
    process.exit(1);
  }

  console.log(`[KeeperHub Sweep] Execution ID: ${sweepResult.executionId}`);
  console.log(`[KeeperHub Sweep] Sweep TxHash: ${sweepResult.txHash}`);

  // Best-effort notify running controller server to broadcast immediately to open dashboards
  try {
    const serverUrl = process.env.VITE_CONTROLLER_API_URL || 'http://localhost:4000';
    const latestActions = store.getActionRecords('agent-spike-runner', 1);
    if (latestActions.length > 0) {
      await fetch(`${serverUrl}/api/broadcast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'action_evaluated',
          record: latestActions[0],
          agent: store.getAgent('agent-spike-runner'),
        }),
      });
    }
  } catch {
    // Controller server not currently active; persistence in SQLite is already saved
  }

  // --------------------------------------------------------------------------
  // ON-CHAIN INDEPENDENT VERIFICATION (BASE MAINNET RPC)
  // --------------------------------------------------------------------------
  if (!IS_SIMULATE) {
    console.log('\n----------------------------------------------------------------');
    console.log('ON-CHAIN INDEPENDENT VERIFICATION (BASE MAINNET RPC)');
    console.log('----------------------------------------------------------------');
    console.log(`[Verification] Querying Base RPC for KeeperHub sweep receipt: ${sweepResult.txHash}`);

    const baseRpcUrl = process.env.BASE_RPC_URL || 'https://mainnet.base.org';
    const publicClient = createPublicClient({
      chain: base,
      transport: http(baseRpcUrl),
    });

    console.log(`[Verification] Awaiting on-chain confirmation (RPC: ${baseRpcUrl})...`);
    let receipt;
    try {
      receipt = await publicClient.waitForTransactionReceipt({
        hash: sweepResult.txHash as Hex,
        timeout: 60_000,
      });
    } catch (err: any) {
      console.error(`\n[FATAL] Failed to fetch transaction receipt for ${sweepResult.txHash}: ${err.message || err}`);
      process.exit(1);
    }

    if (receipt.status !== 'success') {
      console.error(`\n[FATAL] On-chain transaction reverted! Status: ${receipt.status}`);
      process.exit(1);
    }

    console.log(`[Verification] Receipt status: SUCCESS (Block #${receipt.blockNumber})`);
    console.log(`[Verification] Gas Used: ${receipt.gasUsed.toString()}`);

    // Assert USDC contract, recipient, and transfer event
    const CANONICAL_BASE_USDC = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913'.toLowerCase();
    const transferEventAbi = parseAbiItem('event Transfer(address indexed from, address indexed to, uint256 value)');

    let verifiedTransfer: { from: string; to: string; value: bigint; contract: string } | null = null;
    for (const log of receipt.logs) {
      if (log.address.toLowerCase() === CANONICAL_BASE_USDC) {
        try {
          const decoded = decodeEventLog({
            abi: [transferEventAbi],
            data: log.data,
            topics: log.topics,
          });
          if (decoded.eventName === 'Transfer') {
            const { from, to, value } = decoded.args as { from: string; to: string; value: bigint };
            if (to.toLowerCase() === TREASURY_ADDRESS.toLowerCase()) {
              verifiedTransfer = { from, to, value, contract: log.address };
              break;
            }
          }
        } catch {
          // Non-matching log or decoding error; ignore
        }
      }
    }

    if (!verifiedTransfer) {
      console.error(
        `\n[FATAL] On-chain verification failed: Transaction ${sweepResult.txHash} did not contain a canonical USDC ` +
        `transfer to confirmed treasury address (${TREASURY_ADDRESS})!`
      );
      process.exit(1);
    }

    console.log(`[Verification] Canonical Token: USDC (${verifiedTransfer.contract})`);
    console.log(`[Verification] Source/Sender:   ${verifiedTransfer.from}`);
    console.log(`[Verification] Confirmed Dest:  ${verifiedTransfer.to} (MATCHES THROTTLE_TREASURY_ADDRESS)`);
    console.log(`[Verification] Confirmed Amount: ${verifiedTransfer.value.toString()} raw units (${(Number(verifiedTransfer.value) / 1e6).toFixed(6)} USDC)`);
    console.log('[Verification] PASS: Leg 2 KeeperHub sweep independently verified on Base mainnet!');
  } else {
    console.log('\n[Simulation] Skipping on-chain Base RPC receipt verification (--simulate active).');
  }

  // --------------------------------------------------------------------------
  // SUMMARY
  // --------------------------------------------------------------------------
  console.log('\n================================================================');
  if (IS_SIMULATE) {
    console.log('[SIMULATION COMPLETE] Full two-leg execution loop completed successfully.');
    console.log('Notice: Simulation mode demonstrates wiring and schemas; not an on-chain proof.');
    console.log(`Leg 1 Task Creation Settlement: ${spendEvent.txHash}`);
    console.log(`Leg 2 KeeperHub Treasury Sweep:  ${sweepResult.txHash}`);
  } else {
    console.log('[SUCCESS] Full two-leg execution path verified against live endpoints!');
    console.log(`Leg 1 Task Creation Settlement: ${spendEvent.txHash}`);
    console.log(`Leg 2 KeeperHub Treasury Sweep:  ${sweepResult.txHash}`);
    console.log('Turnkey-signed value movement authorized by Throttle Dynamic Autonomy Controller.');
  }
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n[FATAL] Unhandled error in prove-execution-path:', err.message || err);
  process.exit(1);
});


