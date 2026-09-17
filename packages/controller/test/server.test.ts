import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { AddressInfo } from 'node:net';
import { createControllerServer, ThrottleServer } from '../src/server.js';
import { ThrottleStore } from '../src/state/store.js';
import { createDefaultProfile } from '../src/state/agent-profile.js';
import { AuthorityLevel } from '../src/types.js';

describe('Throttle Controller Server API & Custody Guarantees', () => {
  let store: ThrottleStore;
  let server: ThrottleServer;
  let baseUrl: string;

  beforeAll(async () => {
    store = new ThrottleStore(':memory:');
    const profile = createDefaultProfile('agent-server-test', 'ServerTestAgent', {
      maxSingleTransferUsd: 10.0,
    });
    store.saveAgent(profile);

    // Bind to port 0 for an ephemeral port
    server = createControllerServer({ store, port: 0 });
    await new Promise<void>((resolve) => {
      server.listen(0, () => resolve());
    });
    const addr = server.address() as AddressInfo;
    baseUrl = `http://localhost:${addr.port}`;
  });

  afterAll(async () => {
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
    });
    store.close();
  });

  it('proves POST /api/actions/:id/approve returns 404 (no fabricated approval hash possible)', async () => {
    const res = await fetch(`${baseUrl}/api/actions/act-test-1/approve`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('proves POST /api/actions/:id/reject returns 404 (reverted endpoint)', async () => {
    const res = await fetch(`${baseUrl}/api/actions/act-test-1/reject`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({}),
    });

    expect(res.status).toBe(404);
    const body = await res.json();
    expect(body.error).toBe('Not found');
  });

  it('evaluates Level 4 action and stores as pending without fabricated hash', async () => {
    // Depress trust score to force Level 4 APPROVAL_REQUIRED
    const profile = store.getAgent('agent-server-test')!;
    profile.currentAuthorityLevel = AuthorityLevel.APPROVAL_REQUIRED;
    profile.trustScore.current = 25;
    store.saveAgent(profile);

    const res = await fetch(`${baseUrl}/api/evaluate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        agentId: 'agent-server-test',
        amountUsd: 5.0,
        destination: '0x1234567890123456789012345678901234567890',
        protocol: 'taskmarket',
      }),
    });

    expect(res.status).toBe(200);
    const data = await res.json();

    expect(data.decision.authorityLevel).toBe(AuthorityLevel.APPROVAL_REQUIRED);
    expect(data.decision.requiresApproval).toBe(true);
    expect(data.record.executionStatus).toBe('pending');
    expect(data.record.executionTxHash).toBeUndefined();

    // Confirm persisted state via GET /api/actions
    const actionsRes = await fetch(`${baseUrl}/api/actions?agentId=agent-server-test`);
    expect(actionsRes.status).toBe(200);
    const actions = await actionsRes.json();
    expect(actions.length).toBeGreaterThanOrEqual(1);

    const pendingRecord = actions.find((a: any) => a.actionId === data.record.actionId);
    expect(pendingRecord).toBeDefined();
    expect(pendingRecord.executionStatus).toBe('pending');
    expect(pendingRecord.executionTxHash).toBeUndefined();
  });
});
