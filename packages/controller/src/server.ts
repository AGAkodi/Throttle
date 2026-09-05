/**
 * Throttle Controller Local API & Telemetry Server
 * Serves agent state, action feeds, and SSE live events to the Throttle Dashboard.
 */

import http from 'node:http';
import { ThrottleStore } from './state/store.js';

export interface ServerOptions {
  port?: number;
  store: ThrottleStore;
}

export function createControllerServer(options: ServerOptions): http.Server {
  const port = options.port || 4000;
  const store = options.store;
  const sseClients = new Set<http.ServerResponse>();

  const server = http.createServer((req, res) => {
    // CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const url = new URL(req.url || '/', `http://localhost:${port}`);

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

    if (url.pathname === '/api/agents') {
      const agents = store.listAgents();
      res.writeHead(200);
      res.end(JSON.stringify(agents));
      return;
    }

    if (url.pathname.startsWith('/api/agents/')) {
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

    if (url.pathname === '/api/actions') {
      const limit = parseInt(url.searchParams.get('limit') || '50', 10);
      const agentId = url.searchParams.get('agentId') || undefined;
      const actions = store.getActionRecords(agentId, limit);
      res.writeHead(200);
      res.end(JSON.stringify(actions));
      return;
    }

    if (url.pathname === '/api/events') {
      const limit = parseInt(url.searchParams.get('limit') || '20', 10);
      const agentId = url.searchParams.get('agentId') || undefined;
      const events = store.getAuthorityEvents(agentId, limit);
      res.writeHead(200);
      res.end(JSON.stringify(events));
      return;
    }

    res.writeHead(404);
    res.end(JSON.stringify({ error: 'Not found' }));
  });

  return server;
}
