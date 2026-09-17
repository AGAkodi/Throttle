import React from 'react';

export const Footer: React.FC = () => {
  return (
    <footer>
      <div className="wrap">
        <div className="footer-grid">
          <div className="footer-brand">
            <div className="brand">
              <img src="/logo.png" alt="Throttle Logo" className="brand-logo" />
              Throttle
            </div>
            <p>
              A dynamic autonomy controller for long-running onchain agents, built for the KeeperHub × DoraHacks hackathon main track.
            </p>
          </div>
          <div className="footer-col">
            <h6>Project</h6>
            <ul>
              <li><a href="#overview">Overview</a></li>
              <li><a href="#problem">Problem</a></li>
              <li><a href="#solution">Solution</a></li>
              <li><a href="#architecture">Architecture</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h6>Integrations</h6>
            <ul>
              <li><a href="https://github.com/daydreamsai/daydreams" target="_blank" rel="noopener noreferrer">Daydreams</a></li>
              <li><a href="https://taskmarket.dev" target="_blank" rel="noopener noreferrer">TaskMarket</a></li>
              <li><a href="https://keeperhub.com" target="_blank" rel="noopener noreferrer">KeeperHub</a></li>
            </ul>
          </div>
          <div className="footer-col">
            <h6>Links</h6>
            <ul>
              <li><a href="https://github.com/AGAkodi/Throttle" target="_blank" rel="noopener noreferrer">GitHub repository</a></li>
              <li><a href="#live">Live Controller</a></li>
              <li><a href="#live">Telemetry Feed</a></li>
            </ul>
          </div>
        </div>
        <div className="footer-bottom">
          <span>Throttle — built for KeeperHub × DoraHacks, Sep 2026</span>
          <span>Agent proposes. Controller authorizes. KeeperHub executes.</span>
        </div>
      </div>
    </footer>
  );
};
