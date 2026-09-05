import React from 'react';
import { AgentProfile } from '../lib/api-client.js';
import { AuthorityGauge } from '../components/AuthorityGauge.js';
import { TrustRiskChart } from '../components/TrustRiskChart.js';

interface AgentStatusProps {
  agent: AgentProfile | null;
}

export const AgentStatus: React.FC<AgentStatusProps> = ({ agent }) => {
  if (!agent) {
    return <div className="glass-panel" style={{ padding: '24px' }}>Loading agent state...</div>;
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Agent Identity & Quick Stats */}
      <div className="glass-panel" style={{ padding: '24px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '20px' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px' }}>
              <h2 style={{ fontSize: '20px', fontWeight: 600 }}>{agent.name}</h2>
              <span
                style={{
                  fontSize: '11px',
                  fontWeight: 600,
                  padding: '2px 8px',
                  borderRadius: '9999px',
                  backgroundColor: 'rgba(16, 185, 129, 0.15)',
                  color: 'var(--lvl-0)',
                }}
              >
                ACTIVE
              </span>
            </div>
            <p className="font-mono" style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
              Agent ID: {agent.agentId}
            </p>
          </div>

          <div style={{ textAlign: 'right' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)', textTransform: 'uppercase' }}>
              Execution Target
            </span>
            <p style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
              KeeperHub Turnkey (Base Mainnet)
            </p>
          </div>
        </div>

        {/* Core Metrics Grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '16px' }}>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Total Actions</span>
            <p style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>{agent.metrics.totalActions}</p>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Success Rate</span>
            <p style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px', color: 'var(--lvl-0)' }}>
              {agent.metrics.totalActions > 0
                ? Math.round((agent.metrics.successfulActions / agent.metrics.totalActions) * 100)
                : 100}%
            </p>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Hourly Spend</span>
            <p style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>
              ${agent.metrics.hourlySpendUsd.toFixed(2)} / ${agent.policyConstraints.maxHourlySpendUsd}
            </p>
          </div>
          <div style={{ padding: '12px', borderRadius: '8px', backgroundColor: 'rgba(255, 255, 255, 0.03)' }}>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>Baseline Mean</span>
            <p style={{ fontSize: '18px', fontWeight: 700, marginTop: '4px' }}>
              ${agent.baseline.meanAmountUsd.toFixed(2)}
            </p>
          </div>
        </div>
      </div>

      {/* Dynamic Autonomy Level Gauge */}
      <AuthorityGauge level={agent.currentAuthorityLevel} />

      {/* Trust & Drift Cards */}
      <TrustRiskChart
        trustScore={agent.trustScore.current}
        riskScore={agent.currentAuthorityLevel >= 3 ? 65 : 15}
        driftDetected={agent.currentAuthorityLevel >= 3}
      />
    </div>
  );
};
