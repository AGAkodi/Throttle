/**
 * Throttle Controller Standalone API & Telemetry Server Runner
 * Runs on http://localhost:4000
 * Serves real-time SSE stream, agent profiles, evaluation pipeline, and action logs.
 */

import { ThrottleStore } from '../packages/controller/src/index.js';
import { createControllerServer } from '../packages/controller/src/server.js';

const DB_PATH = process.env.CONTROLLER_DB_PATH || './data/throttle.sqlite';
const PORT = parseInt(process.env.PORT || '4000', 10);

console.log(`[Throttle Controller] Initializing store at ${DB_PATH}...`);
const store = new ThrottleStore(DB_PATH);

const server = createControllerServer({ port: PORT, store });

server.listen(PORT, () => {
  console.log(`\n======================================================`);
  console.log(`  THROTTLE DYNAMIC AUTONOMY CONTROLLER API RUNNING   `);
  console.log(`======================================================`);
  console.log(`  Local URL:      http://localhost:${PORT}`);
  console.log(`  SSE Telemetry:  http://localhost:${PORT}/api/stream`);
  console.log(`  Agent Profiles: http://localhost:${PORT}/api/agents`);
  console.log(`  Action Feed:    http://localhost:${PORT}/api/actions`);
  console.log(`  Authority Log:  http://localhost:${PORT}/api/events`);
  console.log(`  Evaluate API:   POST http://localhost:${PORT}/api/evaluate`);
  console.log(`  Simulation API: POST http://localhost:${PORT}/api/simulate`);
  console.log(`======================================================\n`);
});

process.on('SIGINT', () => {
  console.log('\n[Throttle Controller] Shutting down server...');
  server.close(() => {
    store.close();
    process.exit(0);
  });
});
