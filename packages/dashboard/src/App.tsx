import React, { useState, useEffect } from 'react';
import { fetchAgents, fetchActions, AgentProfile, ActionRecord } from './lib/api-client.js';
import { AgentStatus } from './pages/AgentStatus.js';
import { ActivityFeed } from './pages/ActivityFeed.js';
import { DecisionDetail } from './pages/DecisionDetail.js';

export const App: React.FC = () => {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ActionRecord | null>(null);
  const [activeTab, setActiveTab] = useState<'overview' | 'feed' | 'explain'>('overview');

  const loadData = async () => {
    const loadedAgents = await fetchAgents();
    const loadedActions = await fetchActions();
    setAgents(loadedAgents);
    setActions(loadedActions);
    if (!selectedRecord && loadedActions.length > 0) {
      setSelectedRecord(loadedActions[0]);
    }
  };

  useEffect(() => {
    loadData();
    const interval = setInterval(loadData, 3000); // 3s polling refresh
    return () => clearInterval(interval);
  }, []);

  const activeAgent = agents[0] || null;

  return (
    <div style={{ minHeight: '100vh', display: 'flex', flexDirection: 'column' }}>
      {/* Top Header */}
      <header
        style={{
          borderBottom: '1px solid var(--border-subtle)',
          backgroundColor: 'rgba(10, 13, 20, 0.8)',
          backdropFilter: 'blur(12px)',
          padding: '16px 32px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          position: 'sticky',
          top: 0,
          zIndex: 50,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div
            style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #6366f1 0%, #10b981 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: 700,
              fontSize: '16px',
            }}
          >
            T
          </div>
          <div>
            <h1 style={{ fontSize: '18px', fontWeight: 700, letterSpacing: '-0.02em' }}>THROTTLE</h1>
            <span style={{ fontSize: '11px', color: 'var(--text-muted)' }}>
              Dynamic Autonomy Controller • KeeperHub x DoraHacks
            </span>
          </div>
        </div>

        {/* Integration Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: 'var(--lvl-0)',
                boxShadow: '0 0 8px var(--lvl-0)',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              Live Interception Active
            </span>
          </div>

          <span
            style={{
              padding: '4px 10px',
              borderRadius: '6px',
              fontSize: '11px',
              fontWeight: 600,
              backgroundColor: 'rgba(99, 102, 241, 0.15)',
              color: 'var(--lvl-2)',
              border: '1px solid rgba(99, 102, 241, 0.3)',
            }}
          >
            Daydreams + KeeperHub
          </span>
        </div>
      </header>

      {/* Main Content Layout */}
      <main style={{ flex: 1, padding: '24px 32px', maxWidth: '1440px', margin: '0 auto', width: '100%' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Left Column: Agent Status & Gauges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <AgentStatus agent={activeAgent} />
          </div>

          {/* Right Column: Live Feed & Explainability View */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <ActivityFeed
              actions={actions}
              onSelectAction={(record) => setSelectedRecord(record)}
              selectedActionId={selectedRecord?.id}
            />

            {selectedRecord && (
              <DecisionDetail
                record={selectedRecord}
                onClose={() => setSelectedRecord(null)}
              />
            )}
          </div>
        </div>
      </main>
    </div>
  );
};
