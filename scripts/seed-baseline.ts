/**
 * Demo Script: Seed Baseline
 * Establishes an agent's normal operational behavior profile in the SQLite store:
 * - 10 standard TaskMarket actions ($1.00 - $2.50)
 * - Known destinations and protocols
 * - High initial trust score (85%)
 * - Full autonomy (Level 0)
 *
 * Usage:
 *   npx tsx scripts/seed-baseline.ts
 */

import {
  ThrottleStore,
  createDefaultProfile,
  calculateBaseline,
  ProposedAction,
  AuthorityLevel,
} from '../packages/controller/src/index.js';

const DB_PATH = process.env.CONTROLLER_DB_PATH || './data/throttle.sqlite';

async function seed() {
  console.log(`[Seed Baseline] Opening database at ${DB_PATH}...`);
  const store = new ThrottleStore(DB_PATH);

  const agentId = 'daydreams-agent-alpha';
  const profile = createDefaultProfile(agentId, 'Daydreams Alpha Agent', {
    maxSingleTransferUsd: 50.0,
    maxHourlySpendUsd: 150.0,
    maxDailySpendUsd: 500.0,
    allowedChains: ['base'],
    allowedProtocols: ['taskmarket', 'keeperhub'],
  });

  const knownAddresses = [
    '0x1234567890123456789012345678901234567890',
    '0x2345678901234567890123456789012345678901',
    '0x3456789012345678901234567890123456789012',
  ];

  const historicalActions: ProposedAction[] = [];
  const baseTimestamp = Date.now() - 3600000; // 1 hour ago

  for (let i = 1; i <= 10; i++) {
    const amount = 1.0 + (i % 3) * 0.5; // $1.00, $1.50, $2.00
    const dest = knownAddresses[i % knownAddresses.length];

    historicalActions.push({
      id: `seed_act_${i}`,
      agentId,
      timestamp: baseTimestamp + i * 300000,
      type: 'payment',
      chain: 'base',
      protocol: 'taskmarket',
      destination: dest,
      amount: (amount * 1_000_000).toString(),
      amountUsd: amount,
      tokenSymbol: 'USDC',
    });
  }

  // Calculate baseline
  profile.baseline = calculateBaseline(historicalActions, 10);
  profile.currentAuthorityLevel = AuthorityLevel.FULL_AUTONOMY;
  profile.metrics.totalActions = 10;
  profile.metrics.successfulActions = 10;
  profile.metrics.consecutiveSuccessfulActions = 10;

  store.saveAgent(profile);

  console.log(`[Seed Baseline] Successfully established baseline for ${agentId}:`);
  console.log(`  - Mean Amount: $${profile.baseline.meanAmountUsd.toFixed(2)}`);
  console.log(`  - StdDev: $${profile.baseline.stdDevAmountUsd.toFixed(2)}`);
  console.log(`  - Known Destinations: ${profile.baseline.knownDestinations.length}`);
  console.log(`  - Authority Level: Level ${profile.currentAuthorityLevel} (Full Autonomy)`);
  console.log(`  - Trust Score: ${profile.trustScore.current}%`);

  store.close();
}

seed().catch(console.error);
