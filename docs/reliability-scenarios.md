# Throttle — Reliability & Scenario Verification Report

This document records the exact test scenarios executed against the integrated Throttle controller pipeline, matching Section 16 of the hackathon brief.

---

## Summary of Executed Scenarios

| # | Scenario Title | Trigger Condition | Controller Behavior | Verified Status |
| :--- | :--- | :--- | :--- | :--- |
| **1** | Execution Failure & Backoff | Upstream failure / transaction reverted | Failure logged, metrics updated, retry recorded | **PASSED** (`scenarios.test.ts`) |
| **2** | Retry Loop Drift Spike | Agent repeatedly retries 4+ times | Drift detected ($\ge 35$), risk penalty added, authority demoted | **PASSED** (`scenarios.test.ts`) |
| **3** | Policy Violation (Forbidden Target) | Interaction with unwhitelisted chain/protocol | Hard constraint trip $\rightarrow$ instant **Level 5: FROZEN** | **PASSED** (`scenarios.test.ts`) |
| **4** | Dynamic Scope Enforcement | Transfer exceeds restricted mode cap | Single spend cap exceeded $\rightarrow$ blocked before KeeperHub `/sign` | **PASSED** (`scenarios.test.ts`) |
| **5** | Rehabilitation & Recovery | Continuous normal-range execution | Authority restored step-by-step ($4 \rightarrow 3 \rightarrow 2 \rightarrow 1 \rightarrow 0$) | **PASSED** (`scenarios.test.ts`) |

---

## Detailed Scenario Walkthroughs

### Scenario 1: Failure Recorded & Backoff Tracking
* **Setup:** Simulated execution failure in KeeperHub or TaskMarket settlement.
* **Controller Response:** The controller's `BehaviorEmitter` and `AgentMetrics` register the failure, resetting `consecutiveSuccessfulActions` to `0` and incrementing `recentRetries`. Subsequent evaluations display the labeled risk factor `recent failures`.

### Scenario 2: Agent Rapid Retries $\rightarrow$ Drift Detected $\rightarrow$ Authority Reduced
* **Setup:** An agent gets stuck in a loop and initiates 4 rapid retries on the same task.
* **Controller Response:** The `DriftDetector` computes a frequency anomaly and retry spike score. The `AuthorityEngine` transitions the agent out of `Level 0: Full Autonomy` into `Level 2: Enhanced Monitoring` or `Level 3: Restricted`, preventing automated drain of transaction fees.

### Scenario 3: Unknown Protocol / Destination $\rightarrow$ Instant Freeze
* **Setup:** Agent is lured or instructed to invoke `0xmalicious_contract` on `unverified_phishing_dapp`.
* **Controller Response:** `PolicyEngine` detects violations against `allowedProtocols` and `destinationBlocklist`. The agent is immediately demoted to `Level 5: FROZEN`, blocking all tool calls and payment requests.

### Scenario 4: Spend Cap Enforcement in Restricted Authority Mode
* **Setup:** Agent operating in `Level 3: Restricted` (where spend cap is scaled by the 0.25 multiplier, e.g. \$10.00 max) attempts a \$15.00 payment.
* **Controller Response:** `SignGate` intercepts the challenge, determines that \$15.00 exceeds the effective restricted cap of \$10.00, and rejects the challenge *before* calling KeeperHub's `/sign` endpoint.

### Scenario 5: Gradual Rehabilitation (Level 4 $\rightarrow$ 3 $\rightarrow$ 2 $\rightarrow$ 1 $\rightarrow$ 0)
* **Setup:** An agent placed in `Level 4: Approval Required` performs 12 consecutive clean, low-risk, normal-range operations.
* **Controller Response:** The `TrustEngine` steadily accrues trust points (+3.0 per rehabilitation action). The `AuthorityEngine` enforces gradual step-downs (maximum 1 level change per evaluation), moving from Level 4 $\rightarrow$ Level 3 $\rightarrow$ Level 2 $\rightarrow$ Level 1 $\rightarrow$ Level 0.
