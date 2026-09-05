# Throttle — Demo Video Shot List & Script

**Target Duration:** 3 minutes  
**Narrative Structure:** 5 distinct scenes matching Section 20 of the Hackathon Brief

---

## Scene 1: Normal Autonomous Operations (0:00 – 0:40)
* **Visual:** Split screen: Left side shows Daydreams agent logs claiming real tasks on TaskMarket; Right side shows Throttle Dashboard at `Level 0: Full Autonomy` (Green gauge, Trust 85%, Risk < 15%).
* **Action:** Agent discovers and claims standard data processing tasks ($1.00 – $2.00 USDC on Base).
* **Voiceover / Key Beat:**
  > *"Meet Daydreams Agent Alpha. It's running autonomous tasks on TaskMarket. Under static rules, an agent either has blanket wallet access or is blocked. Throttle introduces dynamic autonomy: right now, the agent has established trust and a steady baseline, operating with full autonomy at Level 0. Coarse PreToolUse checks pass, and Gate 2 signs x402 challenges seamlessly through KeeperHub's Turnkey wallet."*

---

## Scene 2: Behavioral Drift Begins (0:40 – 1:15)
* **Visual:** Run `pnpm tsx scripts/simulate-drift.ts`. Dashboard live activity feed triggers yellow/orange monitoring indicators.
* **Action:** The agent encounters an ambiguous prompt or higher-value bids, escalating its spend to $12.00 and querying an unfamiliar external destination.
* **Voiceover / Key Beat:**
  > *"Notice what happens when the agent begins to drift: transaction volume jumps 8x above baseline, targeting an unseen smart contract. Without modifying the agent code, Throttle's Layer 2 Risk Engine detects the anomalies, and Layer 3 Drift Detector flags velocity divergence. The controller dynamically throttles authority from Level 0 down to Level 2 (Enhanced Monitoring), and then Level 3 (Restricted Scope)."*

---

## Scene 3: High-Risk Action Held & Intercepted (1:15 – 1:55)
* **Visual:** Dashboard explainability drawer opens on a blocked/held action. Shows labeled factor breakdown:
  - `amount anomaly`: +30 pts
  - `new destination`: +20 pts
  - `new protocol`: +15 pts
  - Total Risk: 82/100 $\rightarrow$ Transition to **Level 4: Approval Required**.
* **Action:** Agent attempts a $35.00 transfer to an unverified contract.
* **Voiceover / Key Beat:**
  > *"Now the critical test: an adversarial tool call or prompt injection attempts a $35 transfer. Static checks might fail to catch the contextual risk, but Gate 2 intercepts the real 402 challenge before KeeperHub is called. The transaction is instantly held for human approval. The dashboard gives the operator complete explainability: exactly why the score hit 82 points across 4 distinct factors."*

---

## Scene 4: KeeperHub Sign & Turnkey Defense-in-Depth (1:55 – 2:25)
* **Visual:** Operator clicks "Approve" on an authorized request, showing the EIP-3009 payload dispatched to KeeperHub `/api/agentic-wallet/sign` and settled on Base.
* **Action:** Real Base mainnet transaction hash displayed and verified.
* **Voiceover / Key Beat:**
  > *"When human sign-off is granted, Throttle dispatches the verified challenge to KeeperHub's HMAC /sign endpoint. Turnkey's cryptographic spending limits remain the immutable bedrock floor: defense-in-depth where the agent proposes, Throttle authorizes, and KeeperHub executes."*

---

## Scene 5: Rehabilitation & Gradual Recovery (2:25 – 3:00)
* **Visual:** Run `pnpm tsx scripts/simulate-recovery.ts`. Gauge steadily transitions: Level 4 $\rightarrow$ Level 3 $\rightarrow$ Level 2 $\rightarrow$ Level 1 $\rightarrow$ Level 0.
* **Action:** Agent returns to compliant, normal-range operations. Trust score rises from 35% back to 80%+.
* **Voiceover / Key Beat:**
  > *"Unlike rigid blacklist systems, Throttle features rehabilitation. As the agent demonstrates stable, normal-range execution, its trust score steadily regains ground, graduating step-by-step back to full autonomy. Dynamic governance for truly long-running autonomous agents."*
