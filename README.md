# Throttle — Dynamic Autonomy Controller

**Hackathon:** KeeperHub x DoraHacks — Main Track: *"Best Integration into a Live Project"*  
**Live Project Integrated:** [Daydreams](https://github.com/daydreamsai/daydreams) (`lucid-agents` + [TaskMarket](https://taskmarket.dev))  
**Execution Layer:** [KeeperHub](https://keeperhub.com) (`PreToolUse` hook + Workflow Execution Engine (`POST /api/workflows/{id}/execute`) + Turnkey-backed organization treasury sweeps)

---

## One-Line Pitch

An external Dynamic Autonomy Controller that continuously scores a long-running Daydreams agent's risk, trust, and behavioral drift, and dynamically throttles its authority — from full autonomy down to human-approval-required or frozen — gating downstream Turnkey-signed treasury sweeps executed via KeeperHub workflows upon confirmed agent operational spend on TaskMarket.

---

## Architecture Note & Pivot

> **Honest Architecture Pivot:**  
> The project's exploratory design initially considered using KeeperHub's `/api/agentic-wallet/sign` endpoint to sign outbound TaskMarket HTTP 402 payment challenges directly. During live API investigation, we confirmed that `/api/agentic-wallet/sign` requires an internal KeeperHub `workflowSlug` and derives `payTo` and `amount` strictly from that workflow's own registered wallet and marketplace price — it cannot sign payments to arbitrary third-party contracts like TaskMarket.  
> 
> Rather than fabricating a payment or relying on an artificial mock, we implemented a principled, authentic **Two-Leg Architecture**:
> - **Leg 1 (TaskMarket Task Creation Escrow — Agent-Signed):** The agent pays TaskMarket directly via an EIP-3009 `TransferWithAuthorization` signature using its operating wallet key (`AGENT_WALLET_PRIVATE_KEY`) in response to an authentic HTTP 402 challenge. KeeperHub is not involved in signing this third-party payment.
> - **Trigger:** Confirmed on-chain escrow funding emits a `ConfirmedSpend` event containing the verified transaction hash, atomic spend amount, and created task ID.
> - **Leg 2 (Treasury Sweep — Throttle-Gated & KeeperHub-Executed):** Throttle's 5-layer pipeline evaluates the `ConfirmedSpend` event. If authorized, Throttle triggers KeeperHub's workflow execution engine (`POST /api/workflows/{id}/execute`) to execute an on-chain ERC-20 USDC sweep from the organization Turnkey wallet into the configured treasury.

---

## Core Architecture & Flow

```
+-----------------------------------------------------------------------------------+
|                              LEG 1: DAYDREAMS AGENT                               |
|  - Agent runs autonomous task creation cycle on TaskMarket (Base Mainnet)         |
|  - Encounters HTTP 402 Payment Required challenge for task escrow funding        |
|  - Agent signs EIP-3009 TransferWithAuthorization directly via operating wallet  |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                              TRIGGER: CONFIRMED SPEND                             |
|  - Task escrow payment settles on-chain on Base Mainnet                           |
|  - Emits ConfirmedSpend event (txHash, amountUsd, taskId, tokenSymbol)            |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                      THROTTLE CONTROLLER: 5-LAYER PIPELINE                        |
|  Evaluates ConfirmedSpend telemetry:                                              |
|      1. Policy Engine (deterministic spending limits & transfer caps)             |
|      2. Risk Engine (0-100 composite risk score + labeled factors)                |
|      3. Drift Detector (detects anomalies vs. agent historical baseline)          |
|      4. Trust Engine (time-decayed Bayesian/weighted trust score)                 |
|      5. Authority Engine -> Resolves dynamic Authority Level:                     |
|         Level 0: Full Autonomy    | Level 3: Restricted Scope                     |
|         Level 1: Logged Autonomy  | Level 4: Human Approval Required (Hold)       |
|         Level 2: Monitoring       | Level 5: Frozen (Reject)                      |
+----------------------------------------+------------------------------------------+
                                         |
                 +-----------------------+-----------------------+
                 | ALLOW / MONITOR                               | REJECT / HOLD
                 v                                               v
+----------------------------------+            +----------------------------------+
|   KEEPERHUB WORKFLOW EXECUTION   |            |         SWEEP GATED / HELD       |
|  - Preflight simulation dry run  |            |  - Level 4: Action held pending  |
|  - Turnkey org wallet sweep      |            |  - Level 5: Sweep rejected       |
|  - Transfer ERC-20 to treasury   |            |  - Drift / violations penalized  |
|  - Immutable hardware spend cap  |            +----------------------------------+
+----------------+-----------------+
                 |
                 v
+-----------------------------------------------------------------------------------+
|                            LEG 2: ON-CHAIN TREASURY SWEEP                         |
|  - Verified transaction hash confirmed on BaseScan                                |
|  - Completed audit record persisted in Throttle Controller store                  |
+-----------------------------------------------------------------------------------+
```

---

## Non-Negotiable Rules

1. **The agent proposes. The controller authorizes. KeeperHub executes.**
2. **The controller is deterministic, not an LLM.** Decisions are reproducible from identical inputs.
3. **The agent must never influence its own authority.** Signals come only from server-side state and independently observed fields (GUARD-05 discipline).
4. **Dual independent interception points:** Coarse `PreToolUse` hook + fine-grained `SweepGate` / Controller evaluation.
5. **KeeperHub's Turnkey hard limits remain the final safety floor.**

---

## Packages

- **`packages/controller`**: Framework-agnostic dynamic autonomy engine (policy, risk, drift, trust, authority, SQLite persistence).
- **`packages/keeperhub-adapter`**: PreToolUse hook, sweep gate (`sweep-gate.ts`), legacy sign gate (`sign-gate.ts`), decision mapper, and MCP client.
- **`packages/daydreams-adapter`**: TaskMarket raw-REST client, dynamic policy groups, behavior emitter, and demo agent.
- **`packages/dashboard`**: Vite + React + React Router explainability UI.

---

## Quickstart

```bash
# Install dependencies
pnpm install

# Run unit tests and reliability scenario suites
pnpm --filter @throttle/controller test

# Run the Phase 1 execution path harness
pnpm run test:execution-path
```
