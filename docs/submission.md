# Throttle — DoraHacks x KeeperHub Submission Form

### 1. Project Name & Pitch
* **Project Name:** Throttle (Dynamic Autonomy Controller)
* **Tagline:** Behavior-aware dynamic autonomy controller that throttles agent authority and gates downstream Turnkey-signed treasury sweeps executed via KeeperHub workflows.

---

### 2. Which project did you integrate with, and what does it do?
We integrated with **[Daydreams](https://github.com/daydreamsai/daydreams)** (`lucid-agents` + [TaskMarket](https://taskmarket.dev)).  
Daydreams is a framework for building autonomous agents that execute multi-step workflows. On TaskMarket, Daydreams agents discover tasks, bid on or claim bounties, and encounter HTTP 402 payment requirements settled via USDC on Base mainnet. Throttle acts as the external dynamic autonomy controller governing agent spend and gating KeeperHub-executed treasury sweeps of settled earnings.

---

### 3. Which KeeperHub surfaces were used?

#### Two-Leg Architecture & Deliberate Pivot
> **Deliberate Architectural Pivot:**  
> The original design envisioned using KeeperHub's `/api/agentic-wallet/sign` endpoint to sign outbound TaskMarket x402 payment challenges. However, live API verification confirmed that `/api/agentic-wallet/sign` requires a `workflowSlug` bound to a listed KeeperHub workflow, and server-derives `payTo` and `amount` from that workflow's own registered wallet and marketplace price. It cannot sign payments to arbitrary third-party contracts like TaskMarket.  
> 
> We therefore implemented a deliberate, principled two-leg structure:
> - **Leg 1 (TaskMarket Settlement — Agent-Signed):** The outbound TaskMarket x402 payment is signed directly by the agent's own operating wallet key (`AGENT_WALLET_PRIVATE_KEY`) using standard EIP-3009 `TransferWithAuthorization`. KeeperHub is not involved in signing this arbitrary third-party payment.
> - **Trigger:** Confirmed task settlement emits an `EarningsReceived` event.
> - **Leg 2 (Treasury Sweep — Throttle-Gated & KeeperHub-Executed):** Throttle's controller evaluates the `EarningsReceived` event through its 5-layer pipeline (Policy, Risk, Drift, Trust, Authority). If authorized, Throttle calls KeeperHub's workflow execution engine to sweep the funds into the designated treasury address via a Turnkey-signed `transfer-token` step.

#### KeeperHub Surfaces Employed:
1. **KeeperHub Workflow Execution Engine (`POST /api/workflows/{id}/execute` & `get_execution`):**  
   The primary on-chain value movement engine (`sweep-gate.ts` & `mcp-client.ts`). Implements the safe execution pattern: preflight dry-run (`simulate: true`) followed by real execution with `idempotency_key` and terminal receipt polling for the on-chain transaction hash.
2. **Turnkey Organization Wallet & Hardware Spend Caps:**  
   KeeperHub's secure enclave Turnkey wallet executes the on-chain ERC-20 (USDC) token sweep, bounded by immutable hardware spend caps.
3. **PreToolUse Coarse Hook:**  
   Registered alongside `keeperhub-wallet-hook` in Claude/agent settings (`pretooluse-hook.ts`) to intercept tool invocations before network payloads are formed.
4. **KeeperHub MCP Client Wrapper (`mcp-client.ts`):**  
   Exposes both direct REST and MCP tool schemas (`execute_workflow`, `get_execution`) with loud-failure semantics and strict error propagation.

---

### 4. Testnet or Mainnet?
* **Settlement & Sweep Architecture:** Target network is Base Mainnet (canonical USDC contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`).
* **Test & Verification Harness:** In-memory SQLite controller store, deterministic unit/scenario test suites across all monorepo packages, and the two-leg spike harness (`scripts/prove-execution-path.ts`).

---

### 5. What still breaks or is unfinished? (Candid Assessment)
1. **Live Network Credentials for Leg 2 Sweep:** Live execution against `app.keeperhub.com` requires an active Organization API Key (`kh_...`) with write permissions and a deployed sweep workflow. Simulated mode (`--simulate`) verifies the complete schema and decision pipeline, but a live broadcast requires active credentials.
2. **Human Approval UI Webhook:** In Level 4 (Approval Required), the sweep action is held in the controller store with `execution_status = 'pending'`. The operator confirms via the dashboard; real-time mobile/Telegram push webhooks are pending.
3. **TaskMarket Task Submissions:** The autonomous agent handles task discovery, challenge signing, and settlement claim; full multi-step LLM task deliverable submission requires external API worker registration.

---

### 6. Contact Information
* **Team:** Throttle Core Team
* **GitHub Repository:** [Throttle Monorepo](https://github.com/Throttle/throttle)
* **Discord Handle:** `@throttle_lead`
* **Email:** `contact@throttle-controller.dev`
