import React from 'react';
import { ActionRecord } from '../lib/api-client.js';
import { ActivityFeedItem } from '../components/ActivityFeedItem.js';

interface ActivityFeedProps {
  actions: ActionRecord[];
  onSelectAction: (record: ActionRecord) => void;
  selectedActionId?: string;
}

export const ActivityFeed: React.FC<ActivityFeedProps> = ({ actions, onSelectAction, selectedActionId }) => {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <h3 style={{ fontSize: '15px', fontWeight: 600, color: 'var(--text-primary)' }}>
          Live Authority Stream
        </h3>
        <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
          Real-time payment challenges & tool interceptions
        </span>
      </div>

      {actions.length === 0 ? (
        <div className="glass-panel" style={{ padding: '32px', textAlign: 'center', color: 'var(--text-muted)' }}>
          No actions evaluated yet — run the agent or simulation to see live decisions.
        </div>
      ) : (
        actions.map((record) => (
          <ActivityFeedItem
            key={record.id}
            record={record}
            onSelect={onSelectAction}
            isSelected={selectedActionId === record.id}
          />
        ))
      )}
    </div>
  );
};
