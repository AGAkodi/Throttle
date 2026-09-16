import React from 'react';

export const Overview: React.FC = () => {
  return (
    <section className="overview" id="overview">
      <div className="wrap overview-grid">
        <div>
          <div className="eyebrow">Overview</div>
          <blockquote>
            Static permission thresholds can't tell whether today's transaction is{' '}
            <span className="accent">normal or the start of a problem.</span> Throttle
            replaces the fixed limit with a decision that adapts to what the agent has
            actually been doing.
          </blockquote>
        </div>
        <div className="stat-list">
          <div className="stat-row">
            <span className="num">6</span>
            <span className="label">distinct authority levels, from full autonomy to frozen</span>
          </div>
          <div className="stat-row">
            <span className="num">2</span>
            <span className="label">independent gates the agent's payment has to clear</span>
          </div>
          <div className="stat-row">
            <span className="num">1</span>
            <span className="label">hard, deterministic wallet floor that no decision can override</span>
          </div>
          <div className="stat-row">
            <span className="num">24h</span>
            <span className="label">trust half-life — reliability has to be sustained, not banked once</span>
          </div>
        </div>
      </div>
    </section>
  );
};
