import React from 'react';

export const HowItWorks: React.FC = () => {
  return (
    <>
      <section id="how-it-works">
        <div className="wrap">
          <div className="section-head">
            <div className="eyebrow">How it works</div>
            <h2>One evaluation, five layers, one decision</h2>
            <p>
              Every proposed action passes through the same pipeline, in the same order,
              every time. The output is always reproducible from the same inputs.
            </p>
          </div>

          <div className="steps">
            <div className="step">
              <span className="step-num">01</span>
              <div>
                <h4>Hard policy check</h4>
                <p>Deterministic limits — max transfer, allowed chains and protocols, actions per hour — that no score can override.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">02</span>
              <div>
                <h4>Risk scoring</h4>
                <p>The proposed action is scored on amount, destination novelty, protocol familiarity, and current frequency.</p>
                <span className="tagged">outputs a labeled factor breakdown</span>
              </div>
            </div>
            <div className="step">
              <span className="step-num">03</span>
              <div>
                <h4>Drift detection</h4>
                <p>Current behavior is compared against the agent's own established baseline — size, velocity, destination spread.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">04</span>
              <div>
                <h4>Trust update</h4>
                <p>Recent behavior quality adjusts a decaying trust score — violations and drift cost more than clean actions earn back.</p>
              </div>
            </div>
            <div className="step">
              <span className="step-num">05</span>
              <div>
                <h4>Authority decision</h4>
                <p>All four signals combine into one of six authority levels, with a plain-language reason attached to the audit record.</p>
                <span className="tagged">deterministic — never decided by an LLM</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* CTA Band */}
      <div className="cta-band">
        <h3>Watch an agent earn — and lose — its own autonomy</h3>
        <p>The full demo walks through normal operation, a drift event, a held payment, and recovery — with a real transaction at the end of it.</p>
        <a href="https://github.com/AGAkodi/Throttle#demo-walkthrough" target="_blank" rel="noopener noreferrer" className="btn btn-filled">
          Explore full verification suite
        </a>
      </div>
    </>
  );
};
