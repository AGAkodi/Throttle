import React from 'react';
import { AgentProfile, getApiBase } from '../../lib/api-client.js';

interface HeroProps {
  activeAgent?: AgentProfile | null;
  isConnected?: boolean;
  onScenarioTriggered?: () => void;
}

const LEVEL_NAMES = [
  'Full Autonomy',
  'Logged Autonomy',
  'Enhanced Monitoring',
  'Restricted Scope',
  'Approval Required',
  'Frozen',
];

export const Hero: React.FC<HeroProps> = ({ activeAgent, isConnected = true, onScenarioTriggered }) => {
  const [activeLevel, setActiveLevel] = React.useState<number>(0);
  const [localAgentName, setLocalAgentName] = React.useState<string>('agent-spike-runner');
  const [trustScore, setTrustScore] = React.useState<number>(85);
  const [baselineMean, setBaselineMean] = React.useState<number>(1.5);
  const [knownAddressesCount, setKnownAddressesCount] = React.useState<number>(3);
  const [hourlySpend, setHourlySpend] = React.useState<number>(0);
  const [hourlyCap, setHourlyCap] = React.useState<number>(150);
  const [isSimulating, setIsSimulating] = React.useState<boolean>(false);

  React.useEffect(() => {
    if (activeAgent) {
      setActiveLevel(activeAgent.currentAuthorityLevel ?? 0);
      setLocalAgentName(activeAgent.name || activeAgent.agentId);
      setTrustScore(Math.round(activeAgent.trustScore?.current ?? 85));
      setBaselineMean(activeAgent.baseline?.meanAmountUsd ?? 1.5);
      setKnownAddressesCount(activeAgent.baseline?.knownDestinations?.length ?? 3);
      setHourlySpend(activeAgent.metrics?.hourlySpendUsd ?? 0);
      setHourlyCap(activeAgent.policyConstraints?.maxHourlySpendUsd ?? 150);
    }
  }, [activeAgent]);

  const triggerScenario = async (scenario: string) => {
    setIsSimulating(true);
    const apiBase = getApiBase();
    try {
      const res = await fetch(`${apiBase}/api/simulate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scenario, agentId: activeAgent?.agentId || 'agent-spike-runner' }),
      });
      if (res.ok) {
        const data = await res.json();
        if (data.agent) {
          setActiveLevel(data.agent.currentAuthorityLevel ?? 0);
          setTrustScore(Math.round(data.agent.trustScore?.current ?? 85));
        }
        if (onScenarioTriggered) onScenarioTriggered();
        return;
      }
    } catch {
      // Fallback local simulation if controller offline
    } finally {
      setIsSimulating(false);
    }

    // Client fallback simulation
    if (scenario === 'seed') {
      setActiveLevel(0);
      setTrustScore(85);
    } else if (scenario === 'drift') {
      setActiveLevel(3);
      setTrustScore(68);
    } else if (scenario === 'approval') {
      setActiveLevel(4);
      setTrustScore(52);
    } else if (scenario === 'violation') {
      setActiveLevel(5);
      setTrustScore(20);
    } else {
      setActiveLevel(1);
      setTrustScore(82);
    }
    if (onScenarioTriggered) onScenarioTriggered();
  };

  const getRungClass = (level: number) => {
    if (level !== activeLevel) return 'rung';
    if (level <= 2) return 'rung current';
    if (level <= 4) return 'rung current current-watch';
    return 'rung current current-stop';
  };

  const getRungState = (level: number) => {
    if (level === activeLevel) {
      if (level <= 2) return <span className="state ok"><i></i>current</span>;
      if (level <= 4) return <span className="state watch"><i></i>current</span>;
      return <span className="state stop"><i></i>current</span>;
    }
    if (level <= 2) return <span className="state ok"><i></i>available</span>;
    if (level <= 4) return <span className="state watch"><i></i>held in reserve</span>;
    return <span className="state stop"><i></i>held in reserve</span>;
  };

  return (
    <section className="hero">
      <div className="wrap">
        <h1>
          Let agents act freely, <span className="accent">until they shouldn't.</span>
        </h1>
        <p className="sub">
          Throttle is an external authority controller for long-running onchain agents.
          It scores every proposed payment for risk, checks it against the agent's own
          behavioral baseline, and decides — in real time — how much the agent is allowed
          to do right now.
        </p>

        <div className="hero-cta">
          <a href="#live" className="btn btn-filled">Test evaluation sandbox</a>
          <a href="#architecture" className="btn btn-outline">
            See the architecture
            <svg viewBox="0 0 24 24" fill="none">
              <path d="M5 12h14M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </a>
        </div>

        <div className="trust-line">
          <span className="trust-label">Built for KeeperHub × DoraHacks — live integration with</span>
          <div className="partner-pills">
            <span className="partner-pill">Daydreams</span>
            <span className="partner-pill">TaskMarket</span>
            <span className="partner-pill">KeeperHub</span>
          </div>
        </div>

        <div style={{ height: '48px' }}></div>

        {/* LIVE AUTHORITY LADDER PANEL */}
        <div className="ladder-panel" id="ladderPanel">
          <div className="ladder-head">
            <div>
              <h3>
                Live authority state <span className="count" id="agentNameLabel">— {localAgentName}</span>
              </h3>
            </div>
            <span className="live-dot" id="liveHeartbeat">
              <i></i>
              <span id="heartbeatText">{isConnected ? 'evaluating via controller' : 'client simulation active'}</span>
            </span>
          </div>

          {/* Real-time Agent Telemetry Strip */}
          <div className="telemetry-strip">
            <div className="telemetry-card">
              <div className="card-lbl">Trust Score</div>
              <div className="card-val" id="trustScoreVal">{trustScore}%</div>
              <div className="card-sub" id="trustSub">24h half-life decaying</div>
            </div>
            <div className="telemetry-card">
              <div className="card-lbl">Baseline Mean</div>
              <div className="card-val" id="baselineMeanVal">${baselineMean.toFixed(2)}</div>
              <div className="card-sub" id="baselineKnownVal">{knownAddressesCount} known addresses</div>
            </div>
            <div className="telemetry-card">
              <div className="card-lbl">Hourly Spend</div>
              <div className="card-val" id="hourlySpendVal">${hourlySpend.toFixed(2)}</div>
              <div className="card-sub" id="hourlyCapVal">Cap: ${hourlyCap.toFixed(2)} / hr</div>
            </div>
            <div className="telemetry-card">
              <div className="card-lbl">Authority Level</div>
              <div className="card-val" id="activeLevelVal" style={{ color: 'var(--forest)' }}>
                Level {activeLevel}
              </div>
              <div className="card-sub" id="activeStatusVal">{LEVEL_NAMES[activeLevel] || 'Unknown'}</div>
            </div>
          </div>

          {/* 6-Level Ladder */}
          <div className="ladder" id="ladderContainer">
            <div className={getRungClass(0)} id="rung-0" data-level="0">
              <span className="lvl">L0</span>
              <span><span className="name">Full autonomy</span><span className="desc">No additional intervention — normal operations</span></span>
              {getRungState(0)}
            </div>
            <div className={getRungClass(1)} id="rung-1" data-level="1">
              <span className="lvl">L1</span>
              <span><span className="name">Logged autonomy</span><span className="desc">Executes normally, enhanced audit detail recorded</span></span>
              {getRungState(1)}
            </div>
            <div className={getRungClass(2)} id="rung-2" data-level="2">
              <span className="lvl">L2</span>
              <span><span className="name">Enhanced monitoring</span><span className="desc">Executes, re-evaluated continuously against baseline</span></span>
              {getRungState(2)}
            </div>
            <div className={getRungClass(3)} id="rung-3" data-level="3">
              <span className="lvl">L3</span>
              <span><span className="name">Restricted scope</span><span className="desc">Reduced limits (25% spend), verified targets only</span></span>
              {getRungState(3)}
            </div>
            <div className={getRungClass(4)} id="rung-4" data-level="4">
              <span className="lvl">L4</span>
              <span><span className="name">Approval required</span><span className="desc">Paused pending human sign-off via KeeperHub</span></span>
              {getRungState(4)}
            </div>
            <div className={getRungClass(5)} id="rung-5" data-level="5">
              <span className="lvl">L5</span>
              <span><span className="name">Frozen</span><span className="desc">Hard breach — execution halted entirely</span></span>
              {getRungState(5)}
            </div>
          </div>

          {/* Live Scenario Injection Bar */}
          <div className="scenario-bar">
            <span className="scenario-label">
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
              </svg>
              Simulate transition:
            </span>
            <div className="scenario-btn-group">
              <button
                className="pill-btn b-green"
                onClick={() => triggerScenario('seed')}
                disabled={isSimulating}
              >
                <i></i>01 Reset Baseline (L0)
              </button>
              <button
                className="pill-btn b-yellow"
                onClick={() => triggerScenario('drift')}
                disabled={isSimulating}
              >
                <i></i>02 Inject Drift (L3)
              </button>
              <button
                className="pill-btn b-yellow"
                onClick={() => triggerScenario('approval')}
                disabled={isSimulating}
              >
                <i></i>03 Trigger Approval (L4)
              </button>
              <button
                className="pill-btn b-red"
                onClick={() => triggerScenario('violation')}
                disabled={isSimulating}
              >
                <i></i>04 Hard Breach (L5)
              </button>
              <button
                className="pill-btn b-green"
                onClick={() => triggerScenario('recover')}
                disabled={isSimulating}
              >
                <i></i>05 Clean Streak Recovery
              </button>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
};
