/**
 * Throttle Controller Local API & Telemetry Server
 * Serves agent state, action feeds, simulation triggers, and SSE live events
 * to the Throttle Landing Page and Dashboard.
 */

import http from 'node:http';
import { ThrottleStore } from './state/store.js';
import { evaluateAndUpdateProfile } from './evaluate.js';
import { createActionRecord } from './state/action-record.js';
import { createDefaultProfile } from './state/agent-profile.js';
import { calculateBaseline } from './engines/drift-detector.js';
import { ProposedAction, AuthorityLevel } from './types.js';

export interface ServerOptions {
  port?: number;
  store: ThrottleStore;
}

export interface ThrottleServer extends http.Server {
  broadcast: (event: any) => void;
}

export function createControllerServer(options: ServerOptions): ThrottleServer {
  const port = options.port || 4000;
  const store = options.store;
  const sseClients = new Set<http.ServerResponse>();

  function broadcast(data: any) {
    const payload = `data: ${JSON.stringify(data)}\n\n`;
    for (const client of sseClients) {
      try {
        client.write(payload);
      } catch {
        sseClients.delete(client);
      }
    }
  }

  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`);

    // Helper to read JSON request body
    const readJsonBody = (): Promise<any> => {
      return new Promise((resolve, reject) => {
        let body = '';
        req.on('data', chunk => { body += chunk; });
        req.on('end', () => {
          try {
            resolve(body ? JSON.parse(body) : {});
          } catch (err) {
            reject(err);
          }
        });
        req.on('error', reject);
      });
    };

    // SSE Live Stream Endpoint
    if (url.pathname === '/api/stream') {
      res.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      });
      res.write(`data: ${JSON.stringify({ type: 'connected', time: Date.now() })}\n\n`);
      sseClients.add(res);

      req.on('close', () => {
        sseClients.delete(res);
      });
      return;
    }

    // JSON API Endpoints
    res.setHeader('Content-Type', 'application/json');

    // GET /api/agents
    if (req.method === 'GET' && url.pathname === '/api/agents') {
      const agents = store.listAgents();
      res.writeHead(200);
      res.end(JSON.stringify(agents));
      return;
    }

    // GET /api/agents/:id
    if (req.method === 'GET' && url.pathname.startsWith('/api/agents/')) {
      const agentId = url.pathname.replace('/api/agents/', '');
      const agent = store.getAgent(agentId);
      if (!agent) {
        res.writeHead(404);
        res.end(JSON.stringify({ error: 'Agent not found' }));
        return;
      }
      res.writeHead(200);
      res.end(JSON.stringify(agent));
      return;
    }

    // GET /api/actions
    if (req.method === 'GET' && url.pathname === '/api/actions') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const agentId = url.searchParams.get('agentId') || undefined;
      const actions = store.getActionRecords(agentId, limit);
      res.writeHead(200);
      res.end(JSON.stringify(actions));
      return;
    }

    // GET /api/events
    if (req.method === 'GET' && url.pathname === '/api/events') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const agentId = url.searchParams.get('agentId') || undefined;
      const events = store.getAuthorityEvents(agentId, limit);
      res.writeHead(200);
      res.end(JSON.stringify(events));
      return;
    }

    // POST /api/broadcast: Broadcast an event (e.g. from runner script or external gate) to SSE clients
    if (req.method === 'POST' && url.pathname === '/api/broadcast') {
      readJsonBody()
        .then(body => {
          broadcast(body);
          res.writeHead(200);
          res.end(JSON.stringify({ success: true }));
        })
        .catch(err => {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Broadcast failed', message: (err as Error).message }));
        });
      return;
    }

    // POST /api/evaluate: Real-time evaluation of a proposed action
    if (req.method === 'POST' && url.pathname === '/api/evaluate') {
      readJsonBody()
        .then(body => {
          const agentId = body.agentId || body.action?.agentId || 'daydreams-agent-alpha';
          let profile = store.getAgent(agentId);

          if (!profile) {
            // Auto-provision default agent profile if none exists
            profile = createDefaultProfile(agentId, 'Daydreams Agent Alpha');
            store.saveAgent(profile);
          }

          const action: ProposedAction = {
            id: body.id || `act_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
            agentId,
            timestamp: body.timestamp || Date.now(),
            type: body.type || 'payment',
            chain: body.chain || 'base',
            protocol: body.protocol || 'taskmarket',
            destination: body.destination || '0x1234567890123456789012345678901234567890',
            amount: body.amount || (Math.round((body.amountUsd || 1.5) * 1_000_000)).toString(),
            amountUsd: typeof body.amountUsd === 'number' ? body.amountUsd : 1.5,
            tokenSymbol: body.tokenSymbol || 'USDC',
          };

          const { decision, updatedProfile } = evaluateAndUpdateProfile(action, profile);
          store.saveAgent(updatedProfile);

          const record = createActionRecord(
            action,
            decision,
            decision.allowed ? 'executed' : (decision.requiresApproval ? 'pending' : 'rejected')
          );
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

          const broadcastPayload = {
            type: 'action_evaluated',
            record,
            agent: updatedProfile,
            decision,
          };
          broadcast(broadcastPayload);

          res.writeHead(200);
          res.end(JSON.stringify(broadcastPayload));
        })
        .catch(err => {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Invalid JSON body', message: (err as Error).message }));
        });
      return;
    }

    // POST /api/simulate: Quick execution of canonical demo scenarios
    if (req.method === 'POST' && url.pathname === '/api/simulate') {
      readJsonBody()
        .then(body => {
          const scenario = body.scenario || 'seed';
          const agentId = body.agentId || 'daydreams-agent-alpha';

          if (scenario === 'seed') {
            // Seed clean baseline
            const profile = createDefaultProfile(agentId, 'Daydreams Agent Alpha (TaskMarket Worker)');
            const knownAddresses = [
              '0x1234567890123456789012345678901234567890',
              '0x2345678901234567890123456789012345678901',
              '0x3456789012345678901234567890123456789012',
            ];
            const historicalActions: ProposedAction[] = [];
            const now = Date.now();
            for (let i = 1; i <= 10; i++) {
              historicalActions.push({
                id: `seed_act_${i}`,
                agentId,
                timestamp: now - (10 - i) * 60000,
                type: 'payment',
                chain: 'base',
                protocol: 'taskmarket',
                destination: knownAddresses[i % knownAddresses.length],
                amount: '1500000',
                amountUsd: 1.5,
                tokenSymbol: 'USDC',
              });
            }
            profile.baseline = calculateBaseline(historicalActions, 10);
            profile.currentAuthorityLevel = AuthorityLevel.FULL_AUTONOMY;
            profile.trustScore.current = 85.0;
            profile.metrics.totalActions = 10;
            profile.metrics.successfulActions = 10;
            profile.metrics.consecutiveSuccessfulActions = 10;
            store.saveAgent(profile);

            store.recordAuthorityEvent({
              agentId,
              fromLevel: AuthorityLevel.APPROVAL_REQUIRED,
              toLevel: AuthorityLevel.FULL_AUTONOMY,
              reason: 'Baseline established: Full autonomy restored',
              timestamp: now,
            });

            broadcast({ type: 'agent_reset', agent: profile });
            res.writeHead(200);
            res.end(JSON.stringify({ success: true, scenario, agent: profile }));
            return;
          }

          let profile = store.getAgent(agentId);
          if (!profile) {
            profile = createDefaultProfile(agentId, 'Daydreams Agent Alpha');
            store.saveAgent(profile);
          }

          let sampleAction: ProposedAction;
          if (scenario === 'drift') {
            sampleAction = {
              id: `drift_${Date.now()}`,
              agentId,
              timestamp: Date.now(),
              type: 'payment',
              chain: 'base',
              protocol: 'taskmarket',
              destination: '0x9999999999999999999999999999999999999999',
              amount: '12000000',
              amountUsd: 12.0, // 8x baseline
              tokenSymbol: 'USDC',
            };
          } else if (scenario === 'approval') {
            sampleAction = {
              id: `approval_${Date.now()}`,
              agentId,
              timestamp: Date.now(),
              type: 'payment',
              chain: 'base',
              protocol: 'unverified_dex',
              destination: '0x8888888888888888888888888888888888888888',
              amount: '42000000',
              amountUsd: 42.0,
              tokenSymbol: 'USDC',
            };
          } else if (scenario === 'violation') {
            sampleAction = {
              id: `violation_${Date.now()}`,
              agentId,
              timestamp: Date.now(),
              type: 'payment',
              chain: 'solana', // Disallowed chain
              protocol: 'unknown_pool',
              destination: '0xdeadbeefdeadbeefdeadbeefdeadbeefdeadbeef',
              amount: '800000000',
              amountUsd: 800.0, // Exceeds single transfer cap ($50)
              tokenSymbol: 'USDC',
            };
          } else {
            // recover: clean action
            const dest = profile.baseline.knownDestinations[0] || '0x1234567890123456789012345678901234567890';
            sampleAction = {
              id: `recover_${Date.now()}`,
              agentId,
              timestamp: Date.now(),
              type: 'payment',
              chain: 'base',
              protocol: 'taskmarket',
              destination: dest,
              amount: '1500000',
              amountUsd: 1.5,
              tokenSymbol: 'USDC',
            };
          }

          const { decision, updatedProfile } = evaluateAndUpdateProfile(sampleAction, profile);
          store.saveAgent(updatedProfile);

          const record = createActionRecord(
            sampleAction,
            decision,
            decision.allowed ? 'executed' : (decision.requiresApproval ? 'pending' : 'rejected')
          );
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

          const broadcastPayload = {
            type: 'scenario_triggered',
            scenario,
            record,
            agent: updatedProfile,
            decision,
          };
          broadcast(broadcastPayload);

          res.writeHead(200);
          res.end(JSON.stringify(broadcastPayload));
        })
        .catch(err => {
          res.writeHead(400);
          res.end(JSON.stringify({ error: 'Simulation failed', message: (err as Error).message }));
        });
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  (server as ThrottleServer).broadcast = broadcast;
  return server as ThrottleServer;
}

