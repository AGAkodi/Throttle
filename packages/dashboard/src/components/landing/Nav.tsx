import React from 'react';

interface NavProps {
  isConnected?: boolean;
  apiBase?: string;
}

export const Nav: React.FC<NavProps> = ({ isConnected = true, apiBase = 'http://localhost:4000' }) => {
  return (
    <header>
      <div className="navbar">
        <div className="brand">
          <span className="brand-mark">
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M4 18L10 6L14 14L20 4" stroke="#d6f45c" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          Throttle
        </div>
        <div className="nav-links">
          <nav>
            <ul>
              <li><a href="#overview">Overview</a></li>
              <li><a href="#problem">Problem</a></li>
              <li><a href="#solution">Solution</a></li>
              <li><a href="#architecture">Architecture</a></li>
              <li><a href="#how-it-works">How It Works</a></li>
              <li><a href="#live">Live</a></li>
            </ul>
          </nav>
          <div id="connectionStatus" className="api-status-badge" title="Throttle Controller Status">
            <span className={`api-status-dot ${!isConnected ? 'offline' : ''}`} id="apiDot"></span>
            <span id="apiStatusText">
              {isConnected ? `Controller: Online (${apiBase.replace(/^https?:\/\//, '')})` : 'Controller: Connecting...'}
            </span>
          </div>
          <a
            href="https://github.com/AGAkodi/Throttle"
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-filled"
          >
            Repository
          </a>
        </div>
      </div>
    </header>
  );
};
