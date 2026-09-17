import React from 'react';
import { ActionRecord } from '../lib/api-client.js';
import { RiskFactorBreakdown } from '../components/RiskFactorBreakdown.js';

interface DecisionDetailProps {
  record: ActionRecord | null;
  onClose: () => void;
}

export const DecisionDetail: React.FC<DecisionDetailProps> = ({ record, onClose }) => {
  if (!record) {
    return (
      <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
        Select any action from the feed to inspect the deterministic explainability trace.
      </div>
    );
  }

  const { action, decision, timestamp, executionStatus } = record;

  return (
    <div className="glass-panel" style={{ padding: '24px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
        <div>
          <span style={{ fontSize: '11px', fontWeight: 600, color: 'var(--text-muted)', textTransform: 'uppercase' }}>
            Explainability View
          </span>
          <h3 style={{ fontSize: '18px', fontWeight: 600, marginTop: '4px' }}>
            Action: {action.id}
          </h3>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '18px',
          }}
        >
          ✕
        </button>
      </div>

      {/* Decision Rationale Banner */}
      <div
        style={{
          padding: '16px',
          borderRadius: '10px',
          backgroundColor: decision.allowed ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${decision.allowed ? 'var(--lvl-0)' : 'var(--lvl-5)'}`,
        }}
      >
        <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', marginBottom: '4px' }}>
          Outcome: Level {decision.previousAuthorityLevel} ➔ Level {decision.authorityLevel}
        </div>
        <div style={{ fontSize: '13px', color: 'var(--text-primary)' }}>
          {decision.reason}
        </div>
      </div>

      {/* Labeled Factor Breakdown */}
      <RiskFactorBreakdown
        score={decision.riskAssessment.score}
        factors={decision.riskAssessment.factors}
      />

      {/* Drift Signals */}
      <div className="glass-panel" style={{ padding: '16px' }}>
        <h4 style={{ fontSize: '13px', fontWeight: 600, marginBottom: '8px' }}>
          Observed Behavioral Drift Signals
        </h4>
        {decision.driftSignals.reasons.length === 0 ? (
          <span style={{ fontSize: '12px', color: 'var(--text-muted)' }}>
            No drift deviations from baseline.
          </span>
        ) : (
          <ul style={{ paddingLeft: '18px', fontSize: '12px', color: 'var(--text-secondary)' }}>
            {decision.driftSignals.reasons.map((r, i) => (
              <li key={i} style={{ marginBottom: '4px' }}>{r}</li>
            ))}
          </ul>
        )}
      </div>

      {/* Execution Layer Parameters */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', fontSize: '12px' }}>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Destination Address:</span>
          <p className="font-mono" style={{ color: 'var(--text-primary)', wordBreak: 'break-all', marginTop: '2px' }}>
            {action.destination}
          </p>
        </div>
        <div>
          <span style={{ color: 'var(--text-muted)' }}>Value & Protocol:</span>
          <p style={{ color: 'var(--text-primary)', marginTop: '2px' }}>
            ${action.amountUsd.toFixed(2)} {action.tokenSymbol} on {action.protocol} ({action.chain})
          </p>
        </div>
      </div>

      {/* Custody Notice for Level 4 Pending Actions */}
      {(executionStatus === 'pending' || decision.requiresApproval) && (
        <div
          style={{
            padding: '16px',
            borderRadius: '10px',
            backgroundColor: 'rgba(245, 158, 11, 0.1)',
            border: '1px solid var(--lvl-4, #f59e0b)',
            display: 'flex',
            flexDirection: 'column',
            gap: '8px',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span style={{ fontSize: '18px' }}>⚠️</span>
            <div>
              <div style={{ fontSize: '12px', fontWeight: 700, textTransform: 'uppercase', color: 'var(--lvl-4, #f59e0b)' }}>
                Level 4: Operator Approval Required
              </div>
              <div style={{ fontSize: '12px', color: 'var(--text-secondary)', marginTop: '2px' }}>
                This action is held in custody with <code>execution_status = 'pending'</code>. Operator approval execution flow is planned for next-stage tooling.
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
