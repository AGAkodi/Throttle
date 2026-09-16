import React from 'react';

export const Architecture: React.FC = () => {
  return (
    <section className="architecture" id="architecture">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">Architecture</div>
          <h2>
            The agent proposes. The controller authorizes.
            <br />
            KeeperHub executes.
          </h2>
          <p>
            Throttle never signs anything itself. It decides whether a signature
            should be requested at all — execution stays entirely inside KeeperHub's
            Turnkey-backed wallet infrastructure.
          </p>
        </div>

        <div className="flow">
          <div className="flow-node" id="stage-1">
            <div className="fn-index">01</div>
            <h5>Daydreams agent</h5>
            <p>Proposes a payment on TaskMarket — a bid, a claim, a task acceptance.</p>
          </div>
          <div className="flow-node" id="stage-2">
            <div className="fn-index">02</div>
            <h5>402 challenge received</h5>
            <p>TaskMarket returns the real amount, payee, and nonce for the payment.</p>
          </div>
          <div className="flow-node" id="stage-3">
            <div className="fn-index">03</div>
            <h5>Throttle controller</h5>
            <p>Risk, trust, and drift are evaluated against the agent's own history.</p>
          </div>
          <div className="flow-node" id="stage-4">
            <div className="fn-index">04</div>
            <h5>KeeperHub signs</h5>
            <p>Only if authorized — Turnkey produces the EIP-3009 signature.</p>
          </div>
          <div className="flow-node" id="stage-5">
            <div className="fn-index">05</div>
            <h5>Settlement</h5>
            <p>Signature is returned to TaskMarket and the payment settles onchain.</p>
          </div>
        </div>

        <div className="gate-note">
          <div className="gate-card">
            <div className="gate-label">Gate 1 — coarse</div>
            <p>
              A PreToolUse hook checks the proposed action at tool-call time, before
              any payment amount exists yet.
            </p>
          </div>
          <div className="gate-card">
            <div className="gate-label">Gate 2 — fine-grained</div>
            <p>
              Once the real 402 challenge is known, Throttle evaluates the actual
              amount and destination before a signature is ever requested.
            </p>
          </div>
        </div>

        <div className="floor-line">
          Even when Throttle says <b>allow</b>, KeeperHub's Turnkey policy — contract
          allowlist, per-transfer cap, daily cap — remains the final, deterministic floor.
        </div>
      </div>
    </section>
  );
};
