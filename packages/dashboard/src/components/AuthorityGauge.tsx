import React from 'react';

interface AuthorityGaugeProps {
  level: number;
}

const LEVELS = [
  { level: 0, name: 'Full Autonomy', color: 'var(--lvl-0)', desc: 'Standard autonomous execution' },
  { level: 1, name: 'Logged Autonomy', color: 'var(--lvl-1)', desc: 'Enhanced audit trail captured' },
  { level: 2, name: 'Enhanced Monitoring', color: 'var(--lvl-2)', desc: 'High-frequency continuous re-evaluation' },
  { level: 3, name: 'Restricted Scope', color: 'var(--lvl-3)', desc: 'Reduced spend caps & verified targets only' },
  { level: 4, name: 'Approval Required', color: 'var(--lvl-4)', desc: 'Paused pending human operator sign-off' },
  { level: 5, name: 'Frozen', color: 'var(--lvl-5)', desc: 'Completely blocked & denied' },
];

export const AuthorityGauge: React.FC<AuthorityGaugeProps> = ({ level }) => {
  const current = LEVELS.find((l) => l.level === level) || LEVELS[0];

  return (
    <div className="glass-panel" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
        <span style={{ fontSize: '12px', fontWeight: 600, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--text-muted)' }}>
          Authority Hierarchy
        </span>
        <span
          style={{
            padding: '4px 12px',
            borderRadius: '9999px',
            fontSize: '12px',
            fontWeight: 600,
            backgroundColor: `${current.color}18`,
            color: current.color,
            border: `1px solid ${current.color}40`,
          }}
        >
          Level {current.level}: {current.name}
        </span>
      </div>

      {/* 6-Level Progress Rail */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(6, 1fr)', gap: '8px', marginBottom: '16px' }}>
        {LEVELS.map((lvl) => {
          const isActive = lvl.level === level;
          return (
            <div
              key={lvl.level}
              style={{
                height: '8px',
                borderRadius: '4px',
                backgroundColor: isActive ? lvl.color : 'rgba(255, 255, 255, 0.08)',
                boxShadow: isActive ? `0 0 12px ${lvl.color}80` : 'none',
                transition: 'all 0.3s ease',
              }}
            />
          );
        })}
      </div>

      <div style={{ fontSize: '13px', color: 'var(--text-secondary)' }}>
        {current.desc}
      </div>
    </div>
  );
};
