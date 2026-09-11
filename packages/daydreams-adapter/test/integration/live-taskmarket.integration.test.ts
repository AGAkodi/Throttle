/**
 * Live TaskMarket Integration Test
 *
 * NOTE: This test interacts with live network services (api.taskmarket.dev and app.keeperhub.com).
 * It is excluded from default unit test runs (`pnpm test`).
 *
 * To run:
 *   pnpm --filter @throttle/daydreams-adapter test:integration
 */

import { describe, it, expect } from 'vitest';
import { ThrottleStore, createDefaultProfile, AuthorityLevel } from '@throttle/controller';
import { SignGate } from '@throttle/keeperhub-adapter';
import { TaskMarketClient } from '../../src/taskmarket-client.js';
import { TaskMarketAgent } from '../../src/taskmarket-agent.js';

describe('Live TaskMarket Integration [LIVE NETWORK]', () => {
  const isLiveIntegrationEnabled = process.env.RUN_LIVE_INTEGRATION === 'true';

  it('fetches real open tasks from live TaskMarket API', async () => {
    const client = new TaskMarketClient(process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev');
    const tasks = await client.listOpenTasks();

    console.log(`[Live Integration] Retrieved ${tasks.length} open tasks from TaskMarket.`);
    expect(Array.isArray(tasks)).toBe(true);

    if (tasks.length > 0) {
      const first = tasks[0];
      expect(first).toHaveProperty('id');
      expect(first).toHaveProperty('status');
      console.log(`[Live Integration] Sample Task ID: ${first.id} | Status: ${first.status}`);
    }
  });

  it('executes TaskMarketAgent cycle against live API with loud failure semantics', async () => {
    const store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-live-integration', 'LiveAgent');
    store.saveAgent(profile);

    const signGate = new SignGate({
      store,
      keeperHubBaseUrl: process.env.KEEPERHUB_BASE_URL || 'https://app.keeperhub.com',
      keeperHubHmacSecret: process.env.KEEPERHUB_HMAC_SECRET || 'mock_secret_fallback',
      keeperHubSubOrgId: process.env.KEEPERHUB_SUB_ORG_ID || 'mock_sub_org',
      simulationMode: !process.env.KEEPERHUB_HMAC_SECRET,
    });

    const client = new TaskMarketClient(process.env.TASKMARKET_API_URL || 'https://api.taskmarket.dev');
    const agent = new TaskMarketAgent({
      agentId: 'agent-live-integration',
      workerAddress: process.env.KEEPERHUB_WALLET_ADDRESS || '0x1A3B27f02835ef31AEB1f59C4f003233147Bfdc5',
      store,
      signGate,
      client,
    });

    const result = await agent.runCycle();

    // If live settlement succeeded, verify success
    if (result.success) {
      expect(result.stage).toBe('settlement');
      expect(result.signature).toBeDefined();
    } else {
      // If failed, verify failure was surfaced loudly (not swallowed or fabricated)
      console.log(`[Live Integration] Live cycle failed at stage '${result.stage}' with error: ${result.error}`);
      expect(result.error).toBeDefined();
      expect(['discovery', 'dynamic_policy', '402_challenge', 'sign_gate', 'settlement']).toContain(result.stage);
    }
  });
});
