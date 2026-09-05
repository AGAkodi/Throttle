import React from 'react';

interface TrustRiskChartProps {
  trustScore: number;
  riskScore: number;
  driftDetected: boolean;
}

export const TrustRiskChart: React.FC<TrustRiskChartProps> = ({ trustScore, riskScore, driftDetected }) => {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
      {/* Trust Meter */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Earned Trust Model
          </span>
          <span style={{ fontSize: '18px', fontWeight: 700, color: 'var(--lvl-0)' }}>
            {trustScore.toFixed(0)}%
          </span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, trustScore))}%`,
              backgroundColor: 'var(--lvl-0)',
              boxShadow: '0 0 8px rgba(16, 185, 129, 0.6)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Time-decayed (24h half-life) • Penalized by violations
        </span>
      </div>

      {/* Behavioral Drift Indicator */}
      <div className="glass-panel" style={{ padding: '20px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '8px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Behavioral Drift
          </span>
          <span
            style={{
              fontSize: '13px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              backgroundColor: driftDetected ? 'rgba(245, 158, 11, 0.15)' : 'rgba(16, 185, 129, 0.15)',
              color: driftDetected ? 'var(--lvl-3)' : 'var(--lvl-0)',
            }}
          >
            {driftDetected ? 'DRIFT DETECTED' : 'STABLE BASELINE'}
          </span>
        </div>
        <div style={{ height: '6px', borderRadius: '3px', backgroundColor: 'rgba(255, 255, 255, 0.08)', overflow: 'hidden' }}>
          <div
            style={{
              height: '100%',
              width: `${Math.min(100, Math.max(0, riskScore))}%`,
              backgroundColor: driftDetected ? 'var(--lvl-3)' : 'var(--lvl-0)',
              transition: 'width 0.4s ease',
            }}
          />
        </div>
        <span style={{ display: 'block', marginTop: '8px', fontSize: '11px', color: 'var(--text-muted)' }}>
          Diffs current actions vs established operational baseline
        </span>
      </div>
    </div>
  );
};
