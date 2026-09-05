# Throttle — Dynamic Autonomy Controller

**Hackathon:** KeeperHub x DoraHacks — Main Track: *"Best Integration into a Live Project"*  
**Live Project Integrated:** [Daydreams](https://github.com/daydreamsai/daydreams) (`lucid-agents` + [TaskMarket](https://taskmarket.dev))  
**Execution Layer:** [KeeperHub](https://keeperhub.com) (`PreToolUse` hook + `/api/agentic-wallet/sign` gate + Turnkey spend limits floor)

---

## One-Line Pitch

An external Dynamic Autonomy Controller that continuously scores a long-running Daydreams agent's risk, trust, and behavioral drift, and dynamically throttles its authority — from full autonomy down to human-approval-required or frozen — before any x402 payment is signed by KeeperHub's Turnkey-backed wallet.

---

## Core Architecture & Flow

```
+-----------------------------------------------------------------------------------+
|                              DAYDREAMS AGENT LOOP                                |
|  - Agent runs long-horizon autonomous tasks                                      |
|  - Proposes tool calls & encounters HTTP 402 payment challenges on TaskMarket   |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                       GATE 1: PreToolUse Coarse Hook                             |
|  - Intercepts before tool execution (action type, tool name)                      |
|  - Evaluates initial policy & baseline check                                      |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|                 TASKMARKET 402 CHALLENGE (Real Payment Shape)                     |
|  - PayTo, Amount (USDC on Base), ValidBefore, Nonce                               |
+----------------------------------------+------------------------------------------+
                                         |
                                         v
+-----------------------------------------------------------------------------------+
|               GATE 2: Sign-Gate (Fine-Grained Dynamic Autonomy)                  |
|  - Intercepts calls to POST /api/agentic-wallet/sign                             |
|  - Evaluates complete 5-layer Controller Core:                                    |
|      1. Policy Engine (deterministic hard spend & target rules)                   |
|      2. Risk Engine (0-100 score + labeled factor breakdown)                      |
|      3. Drift Detector (compares current action against agent baseline)           |
|      4. Trust Engine (time-decayed weighted model, not a simple counter)         |
|      5. Authority Engine -> Maps to one of 6 distinct Authority Levels:          |
|         Level 0: Full Autonomy                                                    |
|         Level 1: Logged Autonomy                                                  |
|         Level 2: Enhanced Monitoring                                              |
|         Level 3: Restricted Scope                                                 |
|         Level 4: Human Approval Required                                          |
|         Level 5: Frozen (Denied)                                                  |
+----------------------------------------+------------------------------------------+
                                         |
                 +-----------------------+-----------------------+
                 | ALLOW / MONITOR                               | REJECT / FREEZE
                 v                                               v
+----------------------------------+            +----------------------------------+
|      KEEPERHUB SIGNER            |            |        PAYMENT BLOCKED           |
|  - Turnkey hard limit floor      |            |  - Action recorded in audit log  |
|  - EIP-3009 signature generated  |            |  - Drift / violation penalized   |
+----------------+-----------------+            +----------------------------------+
                 |
                 v
+-----------------------------------------------------------------------------------+
|                          TASKMARKET SETTLEMENT                                    |
|  - Retried with PAYMENT-SIGNATURE header -> Real Base Mainnet Transaction         |
+-----------------------------------------------------------------------------------+
```

---

## Non-Negotiable Rules

1. **The agent proposes. The controller authorizes. KeeperHub executes.**
2. **The controller is deterministic, not an LLM.** Decisions are reproducible from identical inputs.
3. **The agent must never influence its own authority.** Signals come only from server-side state and independently observed fields (GUARD-05 discipline).
4. **Dual independent interception points:** Coarse `PreToolUse` hook + fine-grained `/api/agentic-wallet/sign` gate.
5. **KeeperHub's Turnkey hard limits remain the final safety floor.**

---

## Packages

- **`packages/controller`**: Framework-agnostic dynamic autonomy engine (policy, risk, drift, trust, authority, SQLite persistence).
- **`packages/keeperhub-adapter`**: PreToolUse hook, sign gate wrapper, decision mapper, and MCP client.
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
