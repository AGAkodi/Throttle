/**
 * Demo Script: Simulate Drift
 * Injects anomalies and behavioral drift into the running agent:
 * 1. Anomaly 1: Rapid 5x spend deviation
 * 2. Anomaly 2: Interaction with unfamiliar external destination
 * 3. Anomaly 3: Elevated action frequency and retries
 *
 * Demonstrates the Controller automatically dropping authority:
 * Level 0 (Full Autonomy) -> Level 2 (Enhanced Monitoring) -> Level 3 (Restricted) -> Level 4 (Approval Required)
 *
 * Usage:
 *   npx tsx scripts/simulate-drift.ts
 */

import {
  ThrottleStore,
  evaluateAndUpdateProfile,
  createActionRecord,
  ProposedAction,
} from '../packages/controller/src/index.js';
import { getAuthorityLevelName } from '../packages/keeperhub-adapter/src/index.js';

const DB_PATH = process.env.CONTROLLER_DB_PATH || './data/throttle.sqlite';

async function simulate() {
  console.log(`[Simulate Drift] Connecting to database at ${DB_PATH}...`);
  const store = new ThrottleStore(DB_PATH);
  const agentId = 'agent-spike-runner';

  let profile = store.getAgent(agentId);
  if (!profile) {
    console.error(`Agent profile '${agentId}' not found. Run 'pnpm tsx scripts/seed-baseline.ts' first.`);
    return;
  }

  console.log(`Starting Authority: ${getAuthorityLevelName(profile.currentAuthorityLevel)}`);
  console.log(`Current Trust: ${profile.trustScore.current}% | Baseline Mean: $${profile.baseline.meanAmountUsd.toFixed(2)}\n`);

  const driftSteps: ProposedAction[] = [
    {
      id: 'drift_step_1',
      agentId,
      timestamp: Date.now(),
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0x1234567890123456789012345678901234567890',
      amount: '5000000',
      amountUsd: 5.0, // 3x baseline
      tokenSymbol: 'USDC',
    },
    {
      id: 'drift_step_2',
      agentId,
      timestamp: Date.now() + 1000,
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: '0x9999999999999999999999999999999999999999', // New destination
      amount: '12000000',
      amountUsd: 12.0, // 8x baseline
      tokenSymbol: 'USDC',
    },
    {
      id: 'drift_step_3',
      agentId,
      timestamp: Date.now() + 2000,
      type: 'payment',
      chain: 'base',
      protocol: 'unverified_dex', // New protocol
      destination: '0x8888888888888888888888888888888888888888',
      amount: '35000000',
      amountUsd: 35.0, // 23x baseline
      tokenSymbol: 'USDC',
    },
  ];

  for (let i = 0; i < driftSteps.length; i++) {
    const action = driftSteps[i];
    console.log(`--- [Step ${i + 1}] Processing Action: $${action.amountUsd.toFixed(2)} to ${action.destination.slice(0, 10)}... ---`);

    const { decision, updatedProfile } = evaluateAndUpdateProfile(action, profile);
    profile = updatedProfile;
    store.saveAgent(profile);

    const record = createActionRecord(action, decision, decision.allowed ? 'executed' : 'rejected');
    store.saveActionRecord(record);

    if (decision.levelChanged) {
      store.recordAuthorityEvent({
        agentId,
        fromLevel: decision.previousAuthorityLevel,
        toLevel: decision.authorityLevel,
        reason: decision.reason,
        timestamp: decision.timestamp,
      });
    }

    console.log(`  -> Authority Transition: Level ${decision.previousAuthorityLevel} => Level ${decision.authorityLevel} (${getAuthorityLevelName(decision.authorityLevel)})`);
    console.log(`  -> Risk Score: ${decision.riskAssessment.score}/100`);
    console.log(`  -> Labeled Risk Factors:`);
    for (const factor of decision.riskAssessment.factors) {
      console.log(`     - [${factor.label}]: +${factor.points} pts (${factor.description || ''})`);
    }
    console.log(`  -> Trust Score: ${decision.trustScore}%`);
    console.log(`  -> Execution Allowed: ${decision.allowed} | Requires Human Approval: ${decision.requiresApproval}\n`);
  }

  store.close();
  console.log('[Simulate Drift] Drift simulation complete. Check dashboard to see visual transitions.');
}

simulate().catch(console.error);
