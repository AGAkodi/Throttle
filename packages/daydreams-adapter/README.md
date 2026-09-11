# @throttle/daydreams-adapter

Daydreams and TaskMarket raw-REST adapter featuring dynamic policy groups, behavior telemetry emitter, and Gate 2 SignGate interception before KeeperHub Turnkey-backed signing.

## Architecture

- **`TaskMarketAgent`**: Autonomous agent loop executing task discovery, client-side dynamic policy group gating, claim initiation, 402 payment challenge interception, SignGate authorization, and settlement.
- **`TaskMarketClient`**: Raw-REST client interacting directly with `api.taskmarket.dev` for task listing and claim settlement.
- **`DynamicPolicyGroups`**: Maps Controller Level 0–5 autonomy states into client-side spending thresholds and execution policy bounds.
- **`BehaviorEmitter`**: Telemetry emitter recording agent action attempts, retries, and successes into the Controller store.

## Testing

### Deterministic Unit Tests (Default)

All default unit tests are 100% deterministic, network-free, and use injected mock clients:

```bash
# Run from repository root
pnpm --filter @throttle/daydreams-adapter test

# Or run within this package directory
pnpm test
```

### Live Network Integration Tests

Integration tests that hit live external endpoints (`api.taskmarket.dev` and `app.keeperhub.com`) are strictly separated into `test/integration/` and excluded from default test runs.

To execute the live integration test:

```bash
# Run from repository root
pnpm test:integration

# Or run within this package directory
pnpm test:integration
```

Ensure relevant environment variables (`TASKMARKET_API_URL`, `KEEPERHUB_BASE_URL`, `KEEPERHUB_HMAC_SECRET`, `KEEPERHUB_SUB_ORG_ID`, `KEEPERHUB_WALLET_ADDRESS`) are configured in `.env` if testing with funded wallets.
