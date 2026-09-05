/**
 * Demo Script: Simulate Recovery
 * Simulates an agent rehabilitation cycle:
 * Executes 10 clean, normal-range TaskMarket actions to demonstrate gradual authority restoration:
 * Level 4 (Approval Required) -> Level 3 -> Level 2 -> Level 1 -> Level 0 (Full Autonomy)
 *
 * Usage:
 *   npx tsx scripts/simulate-recovery.ts
 */

import {
  ThrottleStore,
  evaluateAndUpdateProfile,
  createActionRecord,
  ProposedAction,
  AuthorityLevel,
} from '../packages/controller/src/index.js';
import { getAuthorityLevelName } from '../packages/keeperhub-adapter/src/index.js';

const DB_PATH = process.env.CONTROLLER_DB_PATH || './data/throttle.sqlite';

async function recover() {
  console.log(`[Simulate Recovery] Connecting to database at ${DB_PATH}...`);
  const store = new ThrottleStore(DB_PATH);
  const agentId = 'daydreams-agent-alpha';

  let profile = store.getAgent(agentId);
  if (!profile) {
    console.error(`Agent profile '${agentId}' not found.`);
    return;
  }

  // Force into Level 4 for demonstration of recovery
  profile.currentAuthorityLevel = AuthorityLevel.APPROVAL_REQUIRED;
  profile.trustScore.current = 35.0;
  profile.metrics.recentRetries = 0;
  profile.metrics.failedActions = 0;
  store.saveAgent(profile);

  console.log(`Initial Rehabilitating Authority: ${getAuthorityLevelName(profile.currentAuthorityLevel)}`);
  console.log(`Starting Trust: ${profile.trustScore.current}%\n`);

  const knownDest = profile.baseline.knownDestinations[0] || '0x1234567890123456789012345678901234567890';

  for (let i = 1; i <= 8; i++) {
    const cleanAction: ProposedAction = {
      id: `recovery_step_${i}`,
      agentId,
      timestamp: Date.now() + i * 1000,
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: knownDest,
      amount: '1500000',
      amountUsd: 1.5,
      tokenSymbol: 'USDC',
    };

    const { decision, updatedProfile } = evaluateAndUpdateProfile(cleanAction, profile);
    profile = updatedProfile;
    store.saveAgent(profile);

    const record = createActionRecord(cleanAction, decision, 'executed');
    store.saveActionRecord(record);

    if (decision.levelChanged) {
      store.recordAuthorityEvent({
        agentId,
        fromLevel: decision.previousAuthorityLevel,
        toLevel: decision.authorityLevel,
        reason: decision.reason,
        timestamp: decision.timestamp,
      });
      console.log(`[Recovery Step ${i}] Level Step-Down: Level ${decision.previousAuthorityLevel} -> Level ${decision.authorityLevel} (${getAuthorityLevelName(decision.authorityLevel)})`);
    } else {
      console.log(`[Recovery Step ${i}] Clean Execution in Level ${decision.authorityLevel} | Trust: ${decision.trustScore.toFixed(1)}% (+earned)`);
    }
  }

  store.close();
  console.log('\n[Simulate Recovery] Agent rehabilitation cycle complete.');
}

recover().catch(console.error);
