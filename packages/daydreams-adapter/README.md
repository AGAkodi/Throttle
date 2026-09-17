# @throttle/daydreams-adapter

Daydreams and TaskMarket adapter providing autonomous task creation, EIP-3009 payment challenge settlement, behavioral telemetry emission, and ConfirmedSpend event generation for Throttle dynamic autonomy gating and downstream KeeperHub sweeps.

## Architecture & Flow

1. **Autonomous Task Creation (Leg 1):** `TaskMarketAgent` creates tasks on TaskMarket (`POST /api/tasks`) in claim/bounty mode.
2. **EIP-3009 Escrow Settlement:** Encounters an authentic HTTP 402 Payment Required challenge and settles the escrow funding directly via agent operating wallet private key (`AGENT_WALLET_PRIVATE_KEY`).
3. **ConfirmedSpend Telemetry Trigger:** Upon on-chain transaction settlement on Base Mainnet, the adapter emits a `ConfirmedSpendEvent` containing the verified transaction hash, atomic spend amount, and created task ID.
4. **Throttle Sweep Gating (Leg 2):** The `ConfirmedSpend` event enters Throttle Controller's 5-layer pipeline to gate KeeperHub-executed Turnkey treasury sweeps (`SweepGate`).

## Components

- **`TaskMarketAgent`**: Autonomous agent executing `runTaskCreationCycle()`, handling HTTP 402 challenges, signing EIP-3009 authorizations, and emitting `ConfirmedSpend` events.
- **`TaskMarketClient`**: REST client interacting with `api.taskmarket.dev` for task creation, 402 challenge negotiation, and payment retries.
- **`DynamicPolicyGroups`**: Maps Controller Level 0–5 autonomy states into client-side spending bounds and policy constraints.
- **`BehaviorEmitter`**: Records agent lifecycle events (attempts, retries, failures) into the Controller store.

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
