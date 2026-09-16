import React from 'react';

export const Solution: React.FC = () => {
  return (
    <section
      id="solution"
      style={{
        background: 'var(--panel)',
        borderTop: '1px solid var(--line)',
        borderBottom: '1px solid var(--line)',
      }}
    >
      <div className="wrap">
        <div className="section-head">
          <div className="eyebrow">The solution</div>
          <h2>Three scores, kept deliberately separate</h2>
          <p>
            Risk, trust, and authority answer different questions and are never
            collapsed into one number. An agent can be highly trusted and still
            have a single risky action held back.
          </p>
        </div>
        <div className="pillars">
          <div className="pillar risk">
            <span className="tag">Risk</span>
            <h4>How dangerous is this action?</h4>
            <p>
              Scored 0–100 from the proposal itself: amount, destination novelty,
              protocol familiarity, and current frequency. Every score returns a
              labeled breakdown, not a bare number.
            </p>
          </div>
          <div className="pillar trust">
            <span className="tag">Trust</span>
            <h4>How reliable has this agent been?</h4>
            <p>
              Built from the quality of recent behavior, not the volume — violations
              and drift cost more than clean actions earn. Decays on a 24-hour
              half-life, so it's never a permanent badge.
            </p>
          </div>
          <div className="pillar authority">
            <span className="tag">Authority</span>
            <h4>What is it allowed to do right now?</h4>
            <p>
              Combines risk, trust, drift, and hard policy into one of six levels —
              and moves the agent between them automatically as conditions change.
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};
