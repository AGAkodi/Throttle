import React, { useState, useEffect, useCallback } from 'react';
import { fetchAgents, fetchActions, subscribeToTelemetry, AgentProfile, ActionRecord, getApiBase } from './lib/api-client.js';
import { AgentStatus } from './pages/AgentStatus.js';
import { ActivityFeed } from './pages/ActivityFeed.js';
import { DecisionDetail } from './pages/DecisionDetail.js';

export const App: React.FC = () => {
  const [agents, setAgents] = useState<AgentProfile[]>([]);
  const [actions, setActions] = useState<ActionRecord[]>([]);
  const [selectedRecord, setSelectedRecord] = useState<ActionRecord | null>(null);
  const [isConnected, setIsConnected] = useState<boolean>(true);
  const [connectionError, setConnectionError] = useState<string | null>(null);

  const loadData = useCallback(async () => {
    try {
      const [loadedAgents, loadedActions] = await Promise.all([
        fetchAgents(),
        fetchActions(),
      ]);
      setAgents(loadedAgents);
      setActions(loadedActions);
      setIsConnected(true);
      setConnectionError(null);
      setSelectedRecord((prev) => {
        if (!prev && loadedActions.length > 0) return loadedActions[0];
        if (prev && loadedActions.some((a) => a.id === prev.id)) return prev;
        return loadedActions[0] || null;
      });
    } catch (err) {
      setIsConnected(false);
      setConnectionError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    // Initial fetch
    loadData();

    // SSE real-time push subscription
    const unsubscribe = subscribeToTelemetry((payload) => {
      setIsConnected(true);
      setConnectionError(null);

      if (payload.record) {
        setActions((prev) => {
          const exists = prev.some((a) => a.id === payload.record!.id);
          if (exists) {
            return prev.map((a) => (a.id === payload.record!.id ? payload.record! : a));
          }
          return [payload.record!, ...prev];
        });
        setSelectedRecord((prev) => prev || payload.record!);
      }

      if (payload.agent) {
        setAgents((prev) => {
          const idx = prev.findIndex((a) => a.agentId === payload.agent!.agentId);
          if (idx >= 0) {
            const copy = [...prev];
            copy[idx] = payload.agent!;
            return copy;
          }
          return [payload.agent!, ...prev];
        });
      }
    }, () => {
      // Stream error handler
    });

    // 3s fallback polling for resilience
    const interval = setInterval(loadData, 3000);

    return () => {
      unsubscribe();
      clearInterval(interval);
    };
  }, [loadData]);

  const activeAgent = agents[0] || null;
  const latestAction = actions[0] || null;
  const apiBase = getApiBase();

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

        {/* Integration & Telemetry Status Badges */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
            <span
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                backgroundColor: isConnected ? 'var(--lvl-0)' : 'var(--lvl-4)',
                boxShadow: isConnected ? '0 0 8px var(--lvl-0)' : '0 0 8px var(--lvl-4)',
                transition: 'all 0.3s ease',
              }}
            />
            <span style={{ fontSize: '12px', fontWeight: 500, color: 'var(--text-secondary)' }}>
              {isConnected ? `Live Telemetry Active (${apiBase})` : 'Connecting to Controller...'}
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
        {connectionError && !activeAgent && (
          <div
            style={{
              marginBottom: '20px',
              padding: '12px 16px',
              borderRadius: '8px',
              backgroundColor: 'rgba(239, 68, 68, 0.1)',
              border: '1px solid var(--lvl-5)',
              color: 'var(--lvl-5)',
              fontSize: '13px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
            }}
          >
            <span>Controller unreachable on {apiBase}. Start with <code>pnpm dev:controller</code> to stream live state.</span>
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr', gap: '24px' }}>
          {/* Left Column: Agent Status & Gauges */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
            <AgentStatus agent={activeAgent} latestAction={latestAction} isConnected={isConnected} />
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
