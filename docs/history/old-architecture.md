# Historical Document: Superseded Architecture & Initial Build Plan

> **SUPERSEDED ARCHITECTURE NOTICE (ARCHIVED)**  
> This document records the initial exploratory architecture and development plan created during the early phase of the hackathon (pre-Sep 15, 2026).  
> It reflects an earlier design hypothesis where KeeperHub's `/api/agentic-wallet/sign` endpoint was investigated for direct payment signing.  
> Following on-chain investigation showing `/api/agentic-wallet/sign` cannot sign arbitrary third-party contract payments (such as TaskMarket task creation), the project pivoted to the authentic **Two-Leg Architecture**:
> - **Leg 1 (TaskMarket Task Creation Escrow — Agent-Signed):** Outbound escrow payments are signed directly by the agent operating wallet via EIP-3009 upon HTTP 402 challenge, with zero KeeperHub involvement.
> - **Trigger:** Verified on-chain settlement emits a `ConfirmedSpend` event.
> - **Leg 2 (Treasury Sweep — Throttle-Gated & KeeperHub-Executed):** Throttle evaluates the spend through its 5-layer pipeline and gates a KeeperHub workflow-executed Turnkey treasury sweep (`transfer-token`).  
>
> For active architecture and submission status, refer to:
> - [docs/submission.md](../submission.md)
> - [README.md](../../README.md)
> - [BUGFIX-TODO.md](../../BUGFIX-TODO.md)

---

# Throttle — Build TODO (Original)

**Project name:** Throttle (Dynamic Autonomy Controller)
**Hackathon:** KeeperHub x DoraHacks — Main Track ONLY ("Best Integration into a Live Project")
**Build window:** Sep 6 – Sep 18, 2026, 12:00 CEST
**Live project integrated:** Daydreams (`lucid-agents` + TaskMarket, raw-REST path)
**Execution layer:** KeeperHub (`/api/agentic-wallet/sign` payment gate + PreToolUse hook + Turnkey hard limits)

Bounty-track work is explicitly OUT OF SCOPE for this build — see `OPTIONAL-bounty.md`.

## One-line pitch

An external Dynamic Autonomy Controller that continuously scores a long-running Daydreams
agent's risk, trust, and behavioral drift, and dynamically throttles its authority — from
full autonomy down to human-approval-required to frozen — before any x402 payment is signed
by KeeperHub's Turnkey-backed wallet. Static thresholds (KeeperHub's `safety.json`, lucid-agents'
`PaymentPolicyGroup` limits) become dynamic, behavior-aware decisions instead.

## Non-negotiable architectural rules

These are hard rules, not defaults to revisit under time pressure:

1. **The agent proposes. The controller authorizes. KeeperHub executes.** No step may be skipped
   or merged, even for a demo shortcut.
2. **The controller is deterministic, not an LLM.** An LLM may extract intent or generate a
   human-readable explanation of a decision. It must NEVER be the thing that outputs
   ALLOW/MONITOR/RESTRICT/APPROVE/FREEZE. That decision must be reproducible from the same
   inputs every time.
3. **The agent must never influence its own authority.** Risk/trust/drift signals come only
   from the controller's own server-side state and from fields it independently observes
   (amount, destination, protocol) — never from a field in the tool call or payment payload
   that the agent itself supplies (mirrors KeeperHub's own GUARD-05 discipline).
4. **Two independent interception points exist for a reason — keep both:**
   - The `PreToolUse` hook (coarse — fires at tool-call time, before any payment amount is
     known)
   - The `/api/agentic-wallet/sign` gate (fine-grained — fires after the real 402 challenge
     is known: real amount, real destination, real nonce)
   Do not collapse these into one check; they catch different things.
5. **KeeperHub's own Turnkey hard limits stay in place regardless of what the controller
   decides.** The controller's ALLOW is never the last word — Turnkey's contract allowlist
   and spend caps are the final floor. This is a deliberate two-layer design, not a bug to
   "fix" by relaxing Turnkey's limits.

---

## Repo structure

```
throttle/
├── README.md                          # pitch, architecture diagram, demo instructions
├── TODO.md                            # this file
├── OPTIONAL-bounty.md                 # out-of-scope bounty-track notes, post-MVP only
├── package.json                       # workspace root (pnpm/bun workspaces)
├── pnpm-workspace.yaml
├── .env.example
├── .gitignore
│
├── packages/
│   ├── controller/                    # THE CORE PRODUCT — engine, framework-agnostic
│   │   ├── src/
│   │   │   ├── engines/
│   │   │   │   ├── policy-engine.ts       # Layer 1: deterministic hard constraints
│   │   │   │   ├── risk-engine.ts         # Layer 2: scores a proposed action 0-100,
│   │   │   │   │                          #   returns a labeled factor breakdown, not
│   │   │   │   │                          #   just a number
│   │   │   │   ├── drift-detector.ts      # Layer 3: baseline vs current behavior
│   │   │   │   ├── trust-engine.ts        # Layer 4: weighted trust model (not a
│   │   │   │   │                          #   success counter — see Phase 2 notes),
│   │   │   │   │                          #   decays over time
│   │   │   │   └── authority-engine.ts    # Layer 5: combines all → decision
│   │   │   ├── state/
│   │   │   │   ├── agent-profile.ts       # baseline, current authority, history
│   │   │   │   ├── action-record.ts       # per-action audit log entry — MUST record the
│   │   │   │   │                          #   distinct level (0 vs 1 etc), not just the
│   │   │   │   │                          #   collapsed hook/gate outcome
│   │   │   │   └── store.ts               # persistence (SQLite for MVP — see Phase 2)
│   │   │   ├── types.ts                   # AuthorityLevel enum (0-5, six distinct levels,
│   │   │   │                              #   see Phase 2), Decision, Signals
│   │   │   ├── evaluate.ts                # main entrypoint: evaluate(proposedAction) → Decision
│   │   │   └── index.ts
│   │   ├── test/
│   │   │   ├── risk-engine.test.ts
│   │   │   ├── drift-detector.test.ts
│   │   │   ├── trust-engine.test.ts
│   │   │   ├── authority-engine.test.ts
│   │   │   └── scenarios.test.ts          # the 5 failure/recovery scenarios from the brief
│   │   └── package.json
│   │
│   ├── keeperhub-adapter/             # Controller ↔ KeeperHub integration — TWO gates
│   │   ├── src/
│   │   │   ├── pretooluse-hook.ts         # Gate 1 (coarse): createDynamicAutonomyHook(),
│   │   │   │                              #   registers alongside keeperhub-wallet-hook,
│   │   │   │                              #   fires at tool-call time (no payment shape yet)
│   │   │   ├── sign-gate.ts               # Gate 2 (fine-grained, THE REAL GATE FOR PAYMENTS):
│   │   │   │                              #   wraps the call to POST
│   │   │   │                              #   /api/agentic-wallet/sign — evaluates the actual
│   │   │   │                              #   402 challenge (real amount, payTo, nonce)
│   │   │   │                              #   through the controller BEFORE requesting the
│   │   │   │                              #   Turnkey signature
│   │   │   ├── decision-mapper.ts         # maps 6-level Authority → {allow|ask|deny} for
│   │   │   │                              #   the hook, and → {proceed|hold|reject} for the
│   │   │   │                              #   sign-gate (richer state logged either way)
│   │   │   ├── mcp-client.ts              # thin wrapper over KeeperHub MCP tool calls
│   │   │   │                              #   (execute_workflow, get_execution, simulate)
│   │   │   └── settings-installer.ts      # writes ~/.claude/settings.json PreToolUse entry
│   │   └── package.json
│   │
│   ├── daydreams-adapter/             # Controller ↔ lucid-agents/TaskMarket integration
│   │   ├── src/
│   │   │   ├── taskmarket-client.ts       # thin raw-REST client against api.taskmarket.dev
│   │   │   │                              #   (NOT the official CLI — see Phase 4)
│   │   │   ├── dynamic-policy-groups.ts   # generates lucid-agents PaymentPolicyGroup[] from
│   │   │   │                              #   current authority level — this is a SECONDARY,
│   │   │   │                              #   coarser check; sign-gate.ts is the real gate
│   │   │   ├── taskmarket-agent.ts        # the demo agent: bids/claims on taskmarket.dev
│   │   │   └── behavior-emitter.ts        # emits action events to controller for scoring
│   │   └── package.json
│   │
│   └── dashboard/                     # Section 15 UI — Vite + React + React Router (NOT
│       │                              # Next.js — no SSR/server-components need for a local
│       │                              # demo tool)
│       ├── src/
│       │   ├── main.tsx
│       │   ├── pages/
│       │   │   ├── AgentStatus.tsx        # authority/trust/risk/drift snapshot
│       │   │   ├── ActivityFeed.tsx       # live feed (approved/monitored/blocked)
│       │   │   └── DecisionDetail.tsx     # "why was this restricted?" explainability view
│       │   ├── components/
│       │   │   ├── AuthorityGauge.tsx
│       │   │   ├── TrustRiskChart.tsx
│       │   │   ├── ActivityFeedItem.tsx
│       │   │   └── RiskFactorBreakdown.tsx   # renders the labeled risk factors, not just
│       │   │                                  #   a bare score
│       │   └── lib/
│       │       └── ws-client.ts           # websocket/SSE feed from controller
│       └── package.json
│
├── scripts/
│   ├── seed-baseline.ts               # establish agent's normal behavior baseline
│   ├── simulate-drift.ts              # demo script: injects the 5 failure scenarios
│   ├── simulate-recovery.ts           # demo script: shows autonomy being restored
│   └── record-demo.md                 # shot list for the demo video
│
└── docs/
    ├── architecture.md                # full data flow diagram + design rationale
    ├── threat-model.md                # compromised agent / prompt injection / drift /
    │                                   #   controller failure / KeeperHub failure — see
    │                                   #   Phase 5b
    ├── submission.md                  # answers to the hackathon's required form questions
    └── reliability-scenarios.md       # the 5 non-happy-path tests, documented with results
```
