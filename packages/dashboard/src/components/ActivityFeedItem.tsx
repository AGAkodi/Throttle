import React from 'react';
import { ActionRecord } from '../lib/api-client.js';

interface ActivityFeedItemProps {
  record: ActionRecord;
  onSelect: (record: ActionRecord) => void;
  isSelected: boolean;
}

export const ActivityFeedItem: React.FC<ActivityFeedItemProps> = ({ record, onSelect, isSelected }) => {
  const { action, decision, timestamp, executionStatus } = record;
  const timeStr = new Date(timestamp).toLocaleTimeString();

  let statusBadge = { text: '✓ Approved', color: 'var(--lvl-0)', bg: 'rgba(16, 185, 129, 0.12)' };

  if (decision.isFrozen) {
    statusBadge = { text: '✕ Frozen / Blocked', color: 'var(--lvl-5)', bg: 'rgba(239, 68, 68, 0.12)' };
  } else if (decision.requiresApproval) {
    statusBadge = { text: '⚠ Approval Required', color: 'var(--lvl-4)', bg: 'rgba(249, 115, 22, 0.12)' };
  } else if (decision.authorityLevel === 3) {
    statusBadge = { text: '⚠ Restricted Scope', color: 'var(--lvl-3)', bg: 'rgba(245, 158, 11, 0.12)' };
  } else if (decision.authorityLevel === 2) {
    statusBadge = { text: '◉ Enhanced Monitoring', color: 'var(--lvl-2)', bg: 'rgba(99, 102, 241, 0.12)' };
  } else if (decision.authorityLevel === 1) {
    statusBadge = { text: '✓ Logged Autonomy', color: 'var(--lvl-1)', bg: 'rgba(6, 182, 212, 0.12)' };
  }

  return (
    <div
      onClick={() => onSelect(record)}
      className="glass-panel"
      style={{
        padding: '16px',
        cursor: 'pointer',
        borderLeft: `4px solid ${statusBadge.color}`,
        borderColor: isSelected ? 'var(--border-highlight)' : undefined,
        backgroundColor: isSelected ? 'var(--bg-card-hover)' : undefined,
        transition: 'all 0.2s ease',
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span
            style={{
              fontSize: '11px',
              fontWeight: 700,
              padding: '2px 8px',
              borderRadius: '4px',
              color: statusBadge.color,
              backgroundColor: statusBadge.bg,
            }}
          >
            {statusBadge.text}
          </span>
          <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text-primary)' }}>
            ${action.amountUsd.toFixed(2)} {action.tokenSymbol}
          </span>
        </div>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>{timeStr}</span>
      </div>

      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '12px', color: 'var(--text-secondary)' }}>
        <span className="font-mono" style={{ fontSize: '11px' }}>
          To: {action.destination.slice(0, 10)}...{action.destination.slice(-6)}
        </span>
        <span>
          Risk: {decision.riskAssessment.score}/100 • Lvl {decision.authorityLevel}
        </span>
      </div>

      {record.executionTxHash && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--lvl-0)' }}>
          Tx: {record.executionTxHash.slice(0, 18)}...
        </div>
      )}
    </div>
  );
};
