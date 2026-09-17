# Throttle — DoraHacks x KeeperHub Submission Form

> **Architecture Status:** Architecture is locked as of September 15, 2026 — no further pivots.

### 1. Project Name & Pitch
* **Project Name:** Throttle (Dynamic Autonomy Controller)
* **Tagline:** Behavior-aware dynamic autonomy controller that throttles agent authority and gates downstream Turnkey-signed treasury sweeps executed via KeeperHub workflows.

---

### 2. Which project did you integrate with, and what does it do?
We integrated with **[Daydreams](https://github.com/daydreamsai/daydreams)** (`lucid-agents` + [TaskMarket](https://taskmarket.dev)).  
Daydreams is a framework for building autonomous agents that execute multi-step workflows. On TaskMarket, Daydreams agents discover tasks, publish bounties, and encounter HTTP 402 payment requirements settled via USDC on Base mainnet. Throttle acts as the external dynamic autonomy controller evaluating the agent's confirmed TaskMarket spend (the task-creation escrow settlement) and dynamically gating a downstream KeeperHub Turnkey treasury sweep.

---

### 3. Which KeeperHub surfaces were used?

#### Two-Leg Architecture & Deliberate Integration Flow
> **Integration Architecture:**  
> The original exploratory design considered using KeeperHub's `/api/agentic-wallet/sign` endpoint to sign outbound TaskMarket x402 payment challenges. However, live API verification confirmed that `/api/agentic-wallet/sign` requires a `workflowSlug` bound to an internal KeeperHub workflow, and server-derives `payTo` and `amount` from that workflow's own registered wallet and marketplace price. It cannot sign payments to arbitrary third-party contracts like TaskMarket.  
> 
> We therefore implemented a deliberate, principled two-leg structure:
> - **Leg 1 (TaskMarket Task Creation Settlement — Agent-Signed):** The outbound TaskMarket task-creation escrow payment is signed directly by the agent's operating wallet key (`AGENT_WALLET_PRIVATE_KEY`) using standard EIP-3009 `TransferWithAuthorization` in response to an authentic HTTP 402 Payment Required challenge. KeeperHub is not involved in signing this arbitrary third-party payment.
> - **Trigger:** Confirmed on-chain escrow funding emits a `ConfirmedSpend` event containing the verified transaction hash, atomic spend amount, and created task ID.
> - **Leg 2 (Treasury Sweep — Throttle-Gated & KeeperHub-Executed):** Throttle's controller evaluates the `ConfirmedSpend` event through its 5-layer pipeline (Policy, Risk, Drift, Trust, Authority). If authorized, Throttle triggers KeeperHub's workflow execution engine to execute an on-chain ERC-20 transfer/sweep from the organization's wallet into a configured treasury address via a Turnkey-signed `transfer-token` step.

#### KeeperHub Surfaces Employed:
1. **KeeperHub Workflow Execution Engine (`POST /api/workflows/{id}/execute` & `/api/workflows/executions/{id}/status`):**  
   The primary on-chain value movement engine (`sweep-gate.ts` & `mcp-client.ts`). Implements the safe execution pattern: preflight dry-run (`simulate: true`) followed by real execution with `X-Idempotency-Key` and terminal receipt polling for the verified on-chain transaction hash.
2. **Turnkey Organization Wallet & Hardware Spend Caps:**  
   KeeperHub's secure enclave Turnkey wallet executes the on-chain ERC-20 (USDC) token sweep, bounded by immutable hardware spend caps.
3. **PreToolUse Coarse Hook:**  
   Registered alongside `keeperhub-wallet-hook` in Claude/agent settings (`pretooluse-hook.ts`) to intercept tool invocations before network payloads are formed.
4. **KeeperHub MCP Client Wrapper (`mcp-client.ts`):**  
   Exposes both direct REST and MCP tool schemas (`execute_workflow`, `get_execution`) with loud-failure semantics and strict error propagation.

---

### 4. Testnet or Mainnet?
* **Settlement & Sweep Architecture:** Base Mainnet (canonical USDC contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
* **Test & Verification Harness:** In-memory SQLite controller store, deterministic unit/scenario test suites across all monorepo packages (49 passing tests), and the two-leg live proof harness (`scripts/prove-execution-path.ts`).

#### Live On-Chain Proof Hashes (Base Mainnet)
The two-leg execution path was executed and confirmed live on Base Mainnet with real funds and signatures:
1. **Leg 1: TaskMarket Task Creation Escrow Settlement (Agent-Signed EIP-3009)**  
   * **Transaction Hash:** [`0x754016f942cf942ee10f3a299233c723791194b66c7a873794fe7427fbbfc691`](https://basescan.org/tx/0x754016f942cf942ee10f3a299233c723791194b66c7a873794fe7427fbbfc691)  
   * **Task ID:** `0xaedacb5003fb21423836fb63beead8b299accffad7a14c6e980550df701d2284`  
   * **Escrow Value:** 0.01 USDC (10,000 raw units)  
   * **Signer:** Agent Operating Wallet  
2. **Leg 2: KeeperHub Treasury Sweep (Turnkey-Signed Organization Transfer)**  
   * **Transaction Hash:** [`0xcbff1cb511b73952aa6c476fbcca8a5d0939c7792369da0ad6f9d9162b0f1529`](https://basescan.org/tx/0xcbff1cb511b73952aa6c476fbcca8a5d0939c7792369da0ad6f9d9162b0f1529)  
   * **Execution ID:** `hw9tw0lmtrkqwbg8zit21`  
   * **Destination:** Configured Treasury Wallet (`THROTTLE_TREASURY_ADDRESS`)  
   * **Block Number:** 51358715 (Status: `success`, verified on-chain)

---

### 5. What still breaks or is unfinished? (Candid Assessment)

1. **Claim-Mode Investigation & Deliberate Scope Choice:**  
   During development, we conducted an in-depth investigation into TaskMarket's task claiming flow (`POST /tasks/{id}/claim`). Live network analysis and specification review confirmed that:
   - Claiming a task is free; it does not issue an HTTP 402 challenge.
   - Task claiming requires canonical EIP-191 personal message signing (`taskmarket:claim:<taskId>`), not EIP-712/EIP-3009 payment authorization.
   - On-chain value movement for workers occurs strictly inbound upon the requester accepting completed work via `/accept`.  
   Rather than constructing an artificial, multi-party simulation (requester + worker lifecycle), we deliberately focused the MVP on the proven, authentic paid-write path: **task creation escrow funding**. Task creation requires a genuine HTTP 402 challenge, an EIP-3009 `TransferWithAuthorization` signature, and immediate on-chain settlement, providing an authentic trigger for Throttle's dynamic autonomy gating and downstream KeeperHub sweep.

2. **Human Approval & Downstream Execution Flow:**  
   When the controller transitions to Level 4 (Approval Required), the proposed action is held in the controller store with `execution_status = 'pending'`. A real operator approve/reject → SweepGate → KeeperHub execution flow is not yet built and is planned as next-stage tooling, along with automated external push notifications (e.g. Telegram/Slack/mobile push webhooks).

3. **External Task Deliverable Processing:**  
   The autonomous agent handles task creation, funding, and claim-signature generation; multi-modal automated deliverable evaluation (for bounties with off-chain evaluators) currently relies on external TaskMarket worker interactions.

4. **Level 3 (Restricted Scope) Spend-Cap Transition Enforcement:**  
   Post-transition policy re-evaluation is implemented in `packages/controller/src/evaluate.ts`. When an action causes an authority downgrade to Level 3 (Restricted), the policy engine immediately re-evaluates the proposed action against the 25% restricted spending limit, disallowing transitional actions that exceed the restricted threshold.

5. **Gate 1 (PreToolUse Hook) Coarse Defaults & Defense-in-Depth Mitigation:**  
   In `packages/keeperhub-adapter/src/pretooluse-hook.ts`, Gate 1 provides coarse, prompt-time tool-call interception before an exact HTTP 402 payment challenge exists:
   - **Unknown Agent Profiles (2.1):** Unrecognized agent IDs currently produce an initial bootstrap allow decision (Level 0) rather than failing closed. In post-submission production releases, unknown agents will default to Level 4 (Approval Required) or restricted autonomy.
   - **Missing Destination Address Fallback (2.2):** When tool invocation arguments omit a target destination, Gate 1 falls back to `0x0000000000000000000000000000000000000000`, which the risk engine scores as zero-deviation rather than high uncertainty.
   - **Missing Amount Fallback (2.3):** Missing or indeterminate amounts fall back to `$0.00` / `0` at tool invocation time.
   - **Architectural Mitigation:** This behavior is an inherent consequence of Gate 1 being a coarse pre-filter where exact on-chain transaction data has not yet been formed. The risk is fully mitigated by Throttle's multi-gate defense-in-depth: all real value movements and wallet actions are strictly evaluated downstream at Gate 2 / SweepGate against confirmed, immutable on-chain payment parameters and authenticated contract destinations before any KeeperHub execution is authorized.

---

### 6. Contact Information
* **Developer:** Gideon Akodi (`Monarch`)
* **GitHub Repository:** [Throttle Monorepo](https://github.com/AGAkodi/Throttle)
* **Discord / X Handle:** `@oxmonrch(discord)/@OxMonarch (X)`
* **Email:** `talk2monarch77@gmail.com `
