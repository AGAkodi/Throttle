# Throttle — Build TODO

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

---

## Phase 0 — Environment & accounts (do first, blocks everything else)

- [ ] Create KeeperHub account at app.keeperhub.com, create an organization
- [ ] Generate a KeeperHub organization API key (Settings → Developer → API keys) — needed for
      MCP auth in headless/CI mode
- [ ] Set up a KeeperHub wallet integration (Turnkey-backed) for the org — confirm it can call
      `signX402Challenge` / `POST /api/agentic-wallet/sign` (this is the actual signer for
      TaskMarket payments, separate from `execute_transfer`/`execute_workflow`)
- [ ] Install `@keeperhub/wallet` and provision an agentic wallet (`keeperhub-wallet add`) —
      note the `subOrgId`, wallet address, and HMAC secret
- [ ] Register on taskmarket.dev — complete the legal acceptance flow once
      (`POST /api/legal/challenge` → sign → `POST /api/legal/accept/wallet`)
- [ ] Fund a small amount of REAL Base mainnet USDC into the agent wallet (TaskMarket has no
      testnet option — see Phase 4)
- [ ] Confirm `docs.keeperhub.com/agent/mcp-server` remote MCP connects successfully
      (`claude mcp add --transport http ...`)
- [ ] Register ONE DoraHacks BUIDL entry for the main track (bounty track is out of scope —
      see `OPTIONAL-bounty.md`)

## Phase 1 — Prove the execution path (PRIORITY 0 — do this before building the full controller)

This phase exists because the single biggest project risk is discovering, late, that a
value-moving payment can bypass KeeperHub entirely. Prove the real path first with a stub
gate, THEN build the sophisticated controller behind it.

- [ ] Write a throwaway script: list one open TaskMarket task, attempt to claim/bid on it via
      the raw-REST API, receive the real 402 challenge
- [ ] Call KeeperHub's `POST /api/agentic-wallet/sign` directly with that challenge
      (`{chain: "base", paymentChallenge: {...}}`) using the HMAC auth scheme — confirm it
      returns a 200 with a real signature (or a legitimate 202/403 from KeeperHub's own
      built-in risk classification — that's fine for this test, it proves the path is real)
- [ ] Retry the TaskMarket request with the signature as the `PAYMENT-SIGNATURE` header —
      confirm settlement succeeds and produces a real, verifiable Base transaction
- [ ] Write down the actual request/response shapes observed (these may differ slightly from
      docs) — this becomes the contract `sign-gate.ts` is built against in Phase 3
- [ ] **Stop and reassess if this does not work.** If KeeperHub's `/sign` endpoint cannot
      produce a signature TaskMarket's facilitator accepts, the whole architecture needs a
      different value-moving action before any more code is written (e.g. gate a downstream
      KeeperHub-executed action — reward withdrawal, rebalance — that TaskMarket triggers,
      rather than gating the x402 payment itself)

## Phase 2 — Controller core (framework-agnostic, no KeeperHub/Daydreams deps yet)

- [ ] Define `types.ts`: `AuthorityLevel` as six DISTINCT levels, each with genuinely
      different behavior (not two levels collapsing to the same outcome):
      - `0` full autonomy — no additional intervention
      - `1` logged autonomy — execution allowed + enhanced audit detail recorded
      - `2` enhanced monitoring — execution allowed + stricter, more frequent re-evaluation
      - `3` restricted — only actions within a reduced scope (smaller amount/known
        destinations only)
      - `4` approval — held for human sign-off
      - `5` frozen — denied
      Even where `1` and `0` map to the same hook/gate outcome, the `ActionRecord` audit
      trail and dashboard must visibly distinguish them.
- [ ] `policy-engine.ts` — hard deterministic constraints (max transfer, approved
      protocols/chains, max tx/hour) that can never be overridden by risk/trust scores
- [ ] `risk-engine.ts` — scores a proposed action 0–100 AND returns a labeled factor
      breakdown, e.g.:
      ```
      { total: 82, factors: [
        { label: "amount anomaly", points: 25 },
        { label: "new destination", points: 20 },
        { label: "new protocol", points: 15 },
        { label: "frequency anomaly", points: 12 },
        { label: "recent failures", points: 10 }
      ]}
      ```
      This is required for the dashboard's explainability view and for the demo pitch — not
      optional polish.
- [ ] `drift-detector.ts` — builds a baseline (typical tx size, actions/hour, known
      protocols/destinations, retry rate) after N actions, then diffs current behavior against it
- [ ] `trust-engine.ts` — a FORMAL weighted model, not a raw success counter. An agent doing
      1,000 successful-but-gradually-more-aggressive transactions must NOT accumulate trust.
      Inputs, roughly:
      - successful normal-range actions → +trust
      - policy violations → −trust (larger weight)
      - unexpected/new destinations → −trust
      - repeated retries → −trust
      - detected behavioral drift → −trust
      - successful recovery period after a drop → +trust
      - sustained long stable period → +trust
      Trust decays over time (exponential moving average or similar) — it is never a
      permanent badge.
- [ ] `authority-engine.ts` — combines policy + risk + drift + trust → one of the six
      `AuthorityLevel`s, with a human-readable `reason` string
- [ ] `evaluate.ts` — single entrypoint `evaluate(action, agentProfile) → Decision`, wraps
      the layers 1→5 pipeline. This function must be deterministic and reproducible — same
      inputs, same output, every time (no LLM call inside this function; see the
      non-negotiable rules above)
- [ ] `store.ts` — persistence for `AgentProfile` and `ActionRecord[]` in SQLite (sufficient
      for MVP; needs to survive process restarts for the demo). Minimal schema: `agents`,
      `actions`, `behavior_metrics`, `authority_events`, `policy_violations` — don't
      over-engineer beyond this
- [ ] Unit tests for each engine in isolation (feed it clearly-normal and clearly-anomalous
      inputs, assert the score/decision)
- [ ] `scenarios.test.ts` — encode the 5 reliability scenarios from the brief section 16 as
      integration tests against the full `evaluate()` pipeline

## Phase 3 — KeeperHub adapter (TWO interception points, not one)

- [ ] Read `@keeperhub/wallet`'s `hook.ts` and `types.ts` — `HookDecision =
      {decision: "allow"|"deny"|"ask", reason?}` — and replicate the same GUARD-05
      field-extraction discipline (amount/unit/contract ONLY, never trust hints)
- [ ] `pretooluse-hook.ts` — Gate 1, coarse. `createDynamicAutonomyHook()`, same factory shape
      as `createPreToolUseHook()`, calls `evaluate()` under the hood. Register this as its
      own `PreToolUse` entry in `~/.claude/settings.json`, alongside (not replacing)
      `keeperhub-wallet-hook`
- [ ] `sign-gate.ts` — Gate 2, THE REAL PAYMENT GATE. Wraps the call to
      `POST /api/agentic-wallet/sign`:
      - Takes the real 402 challenge (amount, payTo, validAfter/Before, nonce) once TaskMarket
        has returned it — this is the first point the actual payment details exist
      - Runs it through `evaluate()`
      - ALLOW/MONITOR → proceed to call `/sign`, get the Turnkey signature, continue
      - APPROVE → hold, surface to a human approval step, only call `/sign` after confirmation
      - RESTRICT → only proceed if the challenge fits the reduced scope, else reject before
        calling `/sign` at all
      - FREEZE → reject before calling `/sign`, log it
      - Confirmed via Phase 1's throwaway script that this endpoint and challenge shape work
        end-to-end — build this against the REAL observed contract, not assumptions from docs
- [ ] `decision-mapper.ts` — shared mapping logic used by both gates, but note gate 1 only
      ever sees a coarse tool-call shape (no amount), while gate 2 sees the real payment
      details — don't assume they receive the same input shape
- [ ] `mcp-client.ts` — wrapper for the KeeperHub MCP tools actually needed:
      `execute_transfer` / `execute_workflow` with `simulate: true` first (dry run), then real
      call with `idempotency_key`, then poll `get_execution` / `get_direct_execution_status`
      (this remains relevant if any part of the demo also uses workflow execution beyond the
      raw x402 payment path)
- [ ] `settings-installer.ts` — register the PreToolUse hook entry
- [ ] Confirm the Turnkey hard limits (contract allowlist, spend caps) are still enforced even
      when the controller says ALLOW — this is the "defense in depth" demo beat, worth
      deliberately testing (try to allow something that Turnkey should still block)

## Phase 4 — Daydreams / TaskMarket adapter

- [ ] Read `lucid-agents/packages/payments/src/policy.ts` types (`PaymentPolicyGroup`,
      `OutgoingLimitsConfig`) fully — confirm the shape needed for `dynamic-policy-groups.ts`
- [ ] **DO NOT use the official `@lucid-agents/taskmarket` CLI** — confirmed it's an opaque
      subprocess that signs/pays internally, not interceptable. Build `taskmarket-client.ts`:
      a thin raw-REST client against `api.taskmarket.dev` (OpenAPI schema at `/openapi.json`),
      built against the exact request/response shapes recorded in Phase 1
- [ ] `dynamic-policy-groups.ts` — given current `AuthorityLevel`/trust/risk state, generate
      a `PaymentPolicyGroup[]` (tighter `maxPaymentUsd`/`maxTotalUsd` at low trust, wider at
      high trust). This is a SECONDARY, coarser check via `wrapBaseFetchWithPolicy` — the
      real authority decision happens in `sign-gate.ts` (Phase 3), not here
- [ ] `behavior-emitter.ts` — hook into the agent's action loop and emit each proposed/executed
      payment as an event the controller's `drift-detector`/`trust-engine` can ingest
- [ ] Handle legal acceptance once per wallet (done in Phase 0, confirm it's still valid)
- [ ] `taskmarket-agent.ts` — the actual demo agent:
      - lists open tasks via `GET /api/tasks` (bounty mode — simplest, one funded outcome,
        one payout)
      - decides to bid/claim on a task
      - on acceptance, the payment flow is: 402 → `dynamic-policy-groups` coarse check →
        `sign-gate.ts` real authority decision → KeeperHub `/sign` → retry with
        `PAYMENT-SIGNATURE` → settlement
      - **note: TaskMarket paid writes require Base MAINNET USDC** — budget a small amount of
        real USDC for the demo
- [ ] Confirm a real task payment flows through the FULL path end-to-end:
      agent decision → dynamic policy check → sign-gate authority decision →
      KeeperHub `/sign` (Turnkey) → TaskMarket settlement → real tx hash

## Phase 5 — Reliability & failure-scenario testing (brief section 16 — judges explicitly score this)

- [ ] Scenario 1: KeeperHub/TaskMarket transaction fails → retry with exponential backoff →
      failure recorded → agent behavior updated
- [ ] Scenario 2: Agent repeatedly retries → retry frequency spike → drift detected →
      authority reduced
- [ ] Scenario 3: Agent requests an unknown/unfamiliar protocol or destination → policy
      violation → restricted
- [ ] Scenario 4: Transaction exceeds current authority's limit → controller rejects before
      `sign-gate.ts` ever calls `/sign`
- [ ] Scenario 5: Agent returns to normal behavior over N actions → authority gradually
      restored (Level 4 → 3 → 2 → 1 → 0)
- [ ] Document each scenario's actual run (logs/screenshots) in `docs/reliability-scenarios.md`
      — this becomes part of the submission's "what still breaks or is unfinished" answer

## Phase 5b — Threat model (required doc, strengthens the security narrative for judges)

Write `docs/threat-model.md` covering at minimum:

- [ ] **Compromised agent** — agent deliberately attempts an unauthorized action. Expected:
      policy engine / authority engine rejects independently of what the agent claims
- [ ] **Prompt injection** — external content (a task description, an API response) tries to
      convince the agent to act against its interest. Expected: the agent may propose the
      action, but the controller evaluates the actual action parameters independently of any
      injected reasoning — the LLM's "explanation" never feeds the decision (rule #2 above)
- [ ] **Behavioral drift** — agent gradually changes behavior over time. Expected: drift
      detector reduces authority progressively, not suddenly
- [ ] **Controller failure/unavailability** — the controller crashes or times out. Expected:
      FAIL CLOSED for any value-moving action (no controller response = no signature request)
- [ ] **KeeperHub/TaskMarket failure** — execution or settlement fails. Expected: failure is
      recorded, retried per the execution layer's own retry policy, and fed back into the
      controller's trust/drift state

## Phase 6 — Dashboard (Section 15 of the brief; build AFTER Phases 1–5, not before)

- [ ] Agent status panel: current authority level (all six distinguishable), trust %, risk
      level, drift status
- [ ] Live activity feed: timestamped list of actions with ✓ approved / ⚠ monitoring /
      ✕ approval-required / frozen, matching the brief's example feed format
- [ ] Explainability view: click any decision → shows the risk factor breakdown (from Phase 2's
      labeled risk-engine output), drift signals that triggered it, and the authority level
      transition (e.g. "Level 1 → Level 4")
- [ ] Wire to controller via websocket/SSE so the feed updates live during the demo
- [ ] Vite + React + React Router — no Next.js, no SSR needed for a local demo tool
- [ ] Simple auth-free local dashboard is fine for MVP — this is a demo tool, not a product

## Phase 7 — Demo & submission prep

- [ ] Write `docs/architecture.md` — the full data-flow diagram + why KeeperHub's Turnkey
      floor, the sign-gate, and the PreToolUse hook are three independent layers
- [ ] Record the demo video following the 5-scene structure from the brief (section 20):
      normal ops → drift begins → high-risk action held/blocked → KeeperHub sign + settlement →
      recovery
- [ ] Get a real transaction hash from the full path (Base mainnet for the TaskMarket leg,
      per Phase 0/4) and link it in the submission
- [ ] Fill out the hackathon's required form questions in `docs/submission.md`:
      - Which project did you integrate with, and what does it do
      - Which KeeperHub surfaces used (agentic-wallet `/sign` endpoint, PreToolUse hook, MCP
        execution, simulate)
      - Testnet or mainnet (be precise: TaskMarket leg is mainnet, note if any other leg
        stayed on testnet)
      - What still breaks / is unfinished (be candid — brief says this helps, not hurts)
      - Contact info (email + X/Discord handle)
- [ ] Submission checklist (brief section 21) — go through every line item before submitting;
      all must be checkable
- [ ] Clean up the repo for repository-level judging: remove dead code, make sure
      `README.md` alone is enough for a judge to understand and run the project

---

## Key references

- KeeperHub docs: https://docs.keeperhub.com/
- KeeperHub MCP server: https://docs.keeperhub.com/agent/mcp-server
- KeeperHub agentic wallet / PreToolUse hook: https://docs.keeperhub.com/agent/agentic-wallet
- KeeperHub repo: https://github.com/KeeperHub/keeperhub
- KeeperHub agentic-wallet repo (hook + sign source): https://github.com/KeeperHub/agentic-wallet
  - `lib/agentic-wallet/sign.ts` — `signX402Challenge` (the actual x402 signer)
  - `lib/payments/x402/payment-gate.ts` — KeeperHub's own inbound x402 handling (payee side,
    for reference/contrast — our use case is buyer-side)
  - `app/api/agentic-wallet/sign/route.ts` — the HMAC-authenticated endpoint `sign-gate.ts`
    wraps
- lucid-agents repo (PaymentPolicy source): https://github.com/daydreamsai/lucid-agents
- Daydreams core: https://github.com/daydreamsai/daydreams
- TaskMarket: https://taskmarket.dev
- TaskMarket agent skill (reference docs only, NOT the CLI): https://github.com/daydreamsai/skills-market
- Hackathon office hours: 12:00 CEST, dates via Discord — https://discord.gg/keeperhub

## Open questions — all resolved as of this revision

- [x] **taskmarket.dev x402 interceptability** — use the raw-REST fallback, not the official
      CLI (opaque subprocess)
- [x] **Testnet vs mainnet** — TaskMarket requires Base mainnet USDC, no testnet option there
- [x] **Can KeeperHub sign TaskMarket's exact challenge shape** — yes, `signX402Challenge` is
      purpose-built for EIP-3009 `TransferWithAuthorization` on Base USDC, the same primitive
      TaskMarket's flow uses
- [x] **Where does the controller actually intercept the payment** — NOT solely the
      PreToolUse hook (fires too early, before the 402 challenge exists) — the real gate is
      `sign-gate.ts` wrapping `POST /api/agentic-wallet/sign`, confirmed callable directly
      over HTTP with HMAC auth
- [ ] Decide bounty vs claim vs pitch mode for the demo task — bounty is likely simplest
      (single funded outcome, single payout) for a clean live demo — resolve during Phase 1
