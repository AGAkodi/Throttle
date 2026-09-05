import React from 'react';

interface Factor {
  label: string;
  points: number;
  description?: string;
}

interface RiskFactorBreakdownProps {
  score: number;
  factors: Factor[];
}

export const RiskFactorBreakdown: React.FC<RiskFactorBreakdownProps> = ({ score, factors }) => {
  return (
    <div className="glass-panel" style={{ padding: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <h4 style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Risk Factor Breakdown
        </h4>
        <span
          style={{
            fontSize: '13px',
            fontWeight: 700,
            color: score >= 75 ? 'var(--lvl-4)' : score >= 40 ? 'var(--lvl-3)' : 'var(--lvl-0)',
          }}
        >
          {score} / 100
        </span>
      </div>

      {factors.length === 0 ? (
        <div style={{ fontSize: '13px', color: 'var(--text-muted)', fontStyle: 'italic' }}>
          No risk penalties flagged (operational parameters nominal).
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {factors.map((f, idx) => (
            <div
              key={idx}
              style={{
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
                padding: '8px 12px',
                borderRadius: '8px',
                backgroundColor: 'rgba(255, 255, 255, 0.03)',
                border: '1px solid rgba(255, 255, 255, 0.05)',
              }}
            >
              <div>
                <span
                  style={{
                    display: 'inline-block',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    fontSize: '11px',
                    fontWeight: 600,
                    textTransform: 'uppercase',
                    backgroundColor: 'rgba(249, 115, 22, 0.15)',
                    color: 'var(--lvl-4)',
                    marginRight: '8px',
                  }}
                >
                  {f.label}
                </span>
                <span style={{ fontSize: '12px', color: 'var(--text-secondary)' }}>
                  {f.description}
                </span>
              </div>
              <span style={{ fontSize: '12px', fontWeight: 700, color: 'var(--lvl-4)' }}>
                +{f.points} pts
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
