import React, { useState } from 'react';

export const Problem: React.FC = () => {
  const [amount, setAmount] = useState<number>(980);

  const isStaticApproved = amount <= 1000;
  const staticResultText = isStaticApproved ? 'approved' : 'rejected (flat cap)';
  const staticResultClass = isStaticApproved ? 'v-bad' : 'v-good';

  let dynamicResultText = 'held for approval (Level 4 drift)';
  if (amount <= 5.0) {
    dynamicResultText = 'approved (baseline match)';
  } else if (amount <= 25.0) {
    dynamicResultText = 'logged & monitored (Level 2)';
  }

  return (
    <section id="problem">
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">The problem</div>
          <h2>Agents don't fail all at once. They drift.</h2>
          <p>
            An agent that behaved safely for its first thousand actions can gradually
            start moving larger amounts, hitting unfamiliar destinations, or retrying
            failed calls more often. A fixed dollar limit has no way to tell "normal
            today" from "suspicious today."
          </p>
        </div>

        {/* Interactive Problem Sandbox Slider */}
        <div className="slider-control">
          <span>Test transfer amount:</span>
          <input
            type="range"
            id="problemSlider"
            min="10"
            max="1200"
            step="10"
            value={amount}
            onChange={(e) => setAmount(Number(e.target.value))}
          />
          <span className="slider-val" id="problemSliderVal">${amount.toLocaleString()} USDC</span>
          <span style={{ fontSize: '12px', color: 'var(--muted)', marginLeft: 'auto' }}>
            Baseline typical: $1.00 – $5.00
          </span>
        </div>

        <div className="problem-compare">
          <div className="compare-col left">
            <span className="compare-tag">Static threshold</span>
            <h4>Same rule, every action</h4>
            <p>
              A cap of $1,000 doesn't know this agent has never sent more than $400,
              never touched this destination, and has retried three times in the
              last minute.
            </p>
            <div className="trace">
              <div><span className="k">rule</span> transfer &le; $1,000</div>
              <div>
                <span className="k">action</span>{' '}
                <span id="staticTraceAction">transfer ${amount.toLocaleString()} → unknown address</span>
              </div>
              <div>
                <span className="k">result</span>{' '}
                <span className={staticResultClass} id="staticTraceResult">{staticResultText}</span>
              </div>
            </div>
          </div>
          <div className="compare-col right">
            <span className="compare-tag">Dynamic authority</span>
            <h4>Same action, read in context</h4>
            <p>
              The same transfer is scored against this agent's own baseline —
              typical size, known destinations, current retry rate — before it's
              allowed through.
            </p>
            <div className="trace">
              <div><span className="k">baseline</span> $1.00–$5.00 · 3 known destinations</div>
              <div>
                <span className="k">action</span>{' '}
                <span id="dynamicTraceAction">transfer ${amount.toLocaleString()} → unknown address</span>
              </div>
              <div>
                <span className="k">result</span>{' '}
                <span className="v-good" id="dynamicTraceResult">{dynamicResultText}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
