# Throttle — DoraHacks x KeeperHub Submission Form

### 1. Project Name & Pitch
* **Project Name:** Throttle (Dynamic Autonomy Controller)
* **Tagline:** Behavior-aware dynamic autonomy controller that throttles agent authority before x402 payments are signed by KeeperHub's Turnkey-backed wallet.

---

### 2. Which project did you integrate with, and what does it do?
We integrated with **[Daydreams](https://github.com/daydreamsai/daydreams)** (`lucid-agents` + [TaskMarket](https://taskmarket.dev)).  
Daydreams is a framework for building autonomous agents that execute multi-step workflows. On TaskMarket, Daydreams agents discover tasks, bid on or claim bounties, and encounter HTTP 402 payment requirements settled via USDC on Base mainnet. Throttle acts as the external dynamic autonomy controller governing the agent's actions and spend.

---

### 3. Which KeeperHub surfaces were used?
1. **Agentic-Wallet `/sign` Endpoint (`POST /api/agentic-wallet/sign`):**  
   The primary payment gate (`sign-gate.ts`). Evaluates real EIP-3009 `TransferWithAuthorization` challenges (real amount, payTo, validAfter/Before, nonce) and issues Turnkey-backed signatures with HMAC authentication.
2. **PreToolUse Coarse Hook:**  
   Registered alongside `keeperhub-wallet-hook` in Claude/agent settings to intercept tool invocations before payment shapes are even formed.
3. **KeeperHub MCP Server (`docs.keeperhub.com/agent/mcp-server`):**  
   Simulate and execute capabilities (`simulate: true` dry runs followed by idempotency-keyed executions).
4. **Turnkey Hard Spend Caps:**  
   Used as the un-bypassable hardware security floor beneath the controller's dynamic evaluations.

---

### 4. Testnet or Mainnet?
* **TaskMarket Payment & Settlement Leg:** Architecture built for Base Mainnet settlement (canonical USDC contract `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`); end-to-end live settlement proof is in progress, see Phase 1 status in TODO.md.
* **Controller Development & Test Leg:** In-memory SQLite / deterministic test harness and execution path harness (`scripts/prove-execution-path.ts`).

---

### 5. What still breaks or is unfinished? (Candid Assessment)
1. **Live TaskMarket Settlement:** Live TaskMarket settlement has not yet been confirmed end-to-end with a real transaction hash. Active tasks on api.taskmarket.dev currently run in bounty/qualification mode rather than direct 402 claim mode, and generic contract signing is awaiting KeeperHub KEEP-311.
2. **Human Approval UI Webhook:** In Level 4 (Approval Required), the transaction is held in the SQLite database with `execution_status = 'pending'`. The operator must click "Approve" in the dashboard; there is currently no push notification to mobile/Telegram.
3. **TaskMarket Task Submissions:** The demo script handles task discovery and claiming via raw-REST 402 challenge flow; complete automated multi-step LLM task deliverable submission requires external API worker registration.
4. **Turnkey Session Refreshing:** If an agentic wallet sub-org session expires during long-running tasks, it requires an HMAC re-auth handshake.

---

### 6. Contact Information
* **Team:** Throttle Core Team
* **GitHub Repository:** [Throttle Monorepo](https://github.com/Throttle/throttle)
* **Discord Handle:** `@throttle_lead`
* **Email:** `contact@throttle-controller.dev`
