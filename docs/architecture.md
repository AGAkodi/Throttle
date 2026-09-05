# Throttle — Architecture & Data Flow Design

## Overview

**Throttle** is an external Dynamic Autonomy Controller built for the **KeeperHub x DoraHacks Main Track ("Best Integration into a Live Project")**. It integrates **Daydreams** (`lucid-agents` + TaskMarket) with **KeeperHub** (`PreToolUse` hook + `/api/agentic-wallet/sign` gate + Turnkey wallet hardware limits).

---

## The Three Independent Interception Layers

A critical design requirement in Throttle is that static thresholds are replaced with behavior-aware dynamic governance across **three independent defense layers**:

```
                                  PROPOSED ACTION
                                         │
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 1: PreToolUse Coarse Hook (Gate 1)                                        │
│ • Executes inside IDE / Claude agent runner before tool execution               │
│ • Filters unapproved tool calls, unsupported chains, and explicit blocklists   │
│ • Fast, coarse check before network calls occur                                 │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Passed
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 2: Sign-Gate Dynamic Autonomy Controller (Gate 2 - The Payment Gate)      │
│ • Intercepts HTTP 402 challenges after TaskMarket produces exact payment parameters │
│ • Evaluates real amounts, destination contracts, and nonces against:            │
│   1. Policy Engine (hard spending limits)                                       │
│   2. Risk Engine (0-100 score + labeled factor breakdown)                       │
│   3. Drift Detector (entropy, frequency, and spend deviations)                 │
│   4. Trust Engine (time-decayed weighted model)                                 │
│   5. Authority Engine (evaluates into 6 distinct Authority Levels)              │
│ • Decides: ALLOW / MONITOR / RESTRICT / APPROVE / FREEZE                         │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Authorized
                                         ▼
┌─────────────────────────────────────────────────────────────────────────────────┐
│ LAYER 3: KeeperHub Hardware-Backed Execution Floor                              │
│ • Turnkey sub-organization wallet limits & contract allowlist                   │
│ • Cryptographic EIP-3009 TransferWithAuthorization signature generated          │
│ • Immutable hardware floor: cannot be relaxed by controller or agent             │
└────────────────────────────────────────┬────────────────────────────────────────┘
                                         │ Signed
                                         ▼
                             TASKMARKET ON-CHAIN SETTLEMENT
```

---

## The 6 Distinct Authority Levels

Unlike binary allow/deny systems, Throttle implements 6 genuinely distinct operational modes:

| Level | Name | Description | Payment Behavior |
| :--- | :--- | :--- | :--- |
| **0** | Full Autonomy | High trust ($>75\%$), low risk ($<25$), stable baseline | Automatic signing, standard logging |
| **1** | Logged Autonomy | Moderate-high trust, low-moderate risk | Automatic signing + high-detail audit recording |
| **2** | Enhanced Monitoring | Moderate trust / risk, minor drift | Automatic signing + continuous re-evaluation frequency |
| **3** | Restricted Scope | Moderate-high risk ($55-75$), new destination | Automatic signing **only within reduced spend cap (25%)** and known targets |
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
