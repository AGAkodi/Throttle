# Throttle — Architecture & Data Flow Design

## Overview

**Throttle** is an external Dynamic Autonomy Controller built for the **KeeperHub x DoraHacks Main Track ("Best Integration into a Live Project")**. It integrates **Daydreams** (`lucid-agents` + TaskMarket) with **KeeperHub** (`PreToolUse` hook + dynamic controller evaluation + Turnkey wallet hardware limits).

---

## Two-Leg Flow & Execution Architecture

Throttle decouples the agent's task-claiming activities from downstream fund movements across **two distinct legs**:

```
 ═══════════════════════════════════════════════════════════════════════════════════
 LEG 1: TASKMARKET SETTLEMENT (AGENT OPERATING WALLET)
 ═══════════════════════════════════════════════════════════════════════════════════
 
        Autonomous Daydreams Agent (TaskMarket Worker)
                             │
                             ▼
              Encounter HTTP 402 Challenge
              (EIP-3009 TransferWithAuthorization)
                             │
                             ▼
       Sign with Agent's OWN Wallet Key (Outside KeeperHub)
                             │
                             ▼
             Confirmed Settlement on TaskMarket
                             │
                             ▼
 ═══════════════════════════════════════════════════════════════════════════════════
 TRIGGER: EarningsReceived Event Emitted { amount, txHash, taskId, timestamp }
 ═══════════════════════════════════════════════════════════════════════════════════
                             │
                             ▼
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │ THROTTLE CONTROLLER: Gate 3 (Sweep-Gate Evaluation)                             │
 │ • Evaluates real amount, destination treasury, and historical telemetry:        │
 │   1. Policy Engine (hard spending limits, allowed chains & protocols)           │
 │   2. Risk Engine (0-100 score + labeled factor breakdown)                       │
 │   3. Drift Detector (entropy, frequency, retry anomalies)                       │
 │   4. Trust Engine (time-decayed weighted model)                                 │
 │   5. Authority Engine (synthesizes into 6 distinct Authority Levels)            │
 │ • Decides: ALLOW / MONITOR / RESTRICT / APPROVE / FREEZE                         │
 └────────────────────────────────────────┬────────────────────────────────────────┘
                                          │
                  ┌───────────────────────┴───────────────────────┐
                  │                                               │
           [Level 4: Hold]                               [Level 0-3: Proceed]
                  │                                               │
                  ▼                                               ▼
         Pending Operator Confirmation              KeeperHub Preflight Simulation
                                                    (execute_workflow with simulate:true)
                                                                  │
                                                                  ▼
 ═════════════════════════════════════════════════════════════════│═════════════════
 LEG 2: KEEPERHUB-EXECUTED TREASURY SWEEP                         │
 ═════════════════════════════════════════════════════════════════│═════════════════
                                                                  ▼
 ┌─────────────────────────────────────────────────────────────────────────────────┐
 │ KEEPERHUB TURNKEY EXECUTION LAYER (Inside KeeperHub)                            │
 │ • POST /api/workflows/{sweepWorkflowId}/execute with Idempotency Key            │
 │ • Turnkey Secure Enclave Signs & Broadcasts transfer-token Step                 │
 │ • Hardware Spend Caps enforce un-bypassable floor                               │
 │ • Terminal status polled via get_execution                                      │
 └────────────────────────────────────────┬────────────────────────────────────────┘
                                          │
                                          ▼
                      CONFIRMED TREASURY SWEEP ON BASE
```

---

## Why This Two-Leg Structure?

### The Integration Point Pivot
Originally, Throttle sought to use KeeperHub's `/api/agentic-wallet/sign` endpoint to sign outbound TaskMarket x402 payment challenges. However, live API verification revealed that `/api/agentic-wallet/sign` requires a `workflowSlug` bound to a listed KeeperHub workflow, and server-derives `payTo` and `amount` from that workflow's own registered wallet and price. It cannot sign arbitrary third-party payments like TaskMarket bounties.

KeeperHub's `transfer-token` workflow step *can* move ERC-20 tokens (USDC on Base) from the organization's Turnkey wallet to any caller-specified recipient. We therefore moved KeeperHub's integration point one step downstream:
- **Leg 1:** Agent self-signs outbound TaskMarket payment challenges directly.
- **Leg 2:** Once task settlement is confirmed on-chain, Throttle's controller gates a KeeperHub-executed sweep into the organization's reserve or treasury address. This is the real, Turnkey-signed, tx-hash-bearing value movement KeeperHub executes.

---

## The 6 Distinct Authority Levels

Unlike binary allow/deny systems, Throttle implements 6 genuinely distinct operational modes:

| Level | Name | Description | Sweep Behavior |
| :--- | :--- | :--- | :--- |
| **0** | Full Autonomy | High trust ($>75\%$), low risk ($<25$), stable baseline | Automatic dry-run preflight + real execution |
| **1** | Logged Autonomy | Moderate-high trust, low-moderate risk | Automatic execution + high-detail audit recording |
| **2** | Enhanced Monitoring | Moderate trust / risk, minor drift | Automatic execution + high-frequency telemetry check |
| **3** | Restricted Scope | Moderate-high risk ($55-75$), new destination | Execution authorized **only within reduced spend cap (25%)** |
| **4** | Approval Required | High risk ($75-90$), severe drift | Execution held pending operator confirmation |
| **5** | Frozen (Denied) | Policy breach, risk $>90$, or trust $<15\%$ | Completely blocked/denied, alerts triggered |

---

## Explainability Model

Every decision in Throttle is completely deterministic and reproducible from server-side state. For each evaluation, the controller produces a labeled factor breakdown:

```json
{
  "total": 82,
  "factors": [
    { "label": "amount anomaly", "points": 30, "description": "Amount $12.00 is 6x higher than baseline average" },
    { "label": "new destination", "points": 20, "description": "Target address outside baseline history" },
    { "label": "new protocol", "points": 15, "description": "Unobserved protocol interaction" },
    { "label": "recent failures", "points": 10, "description": "Elevated failure rate" },
    { "label": "retry spike", "points": 7, "description": "Successive retries detected" }
  ]
}
```

This ensures operators and judges have complete transparency into why autonomy was adjusted.
