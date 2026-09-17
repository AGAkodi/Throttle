import React, { useState, useEffect, useCallback } from 'react';
import { fetchAgents, fetchActions, subscribeToTelemetry, AgentProfile, ActionRecord, getApiBase } from './lib/api-client.js';
import { Nav } from './components/landing/Nav.js';
import { Hero } from './components/landing/Hero.js';
import { Overview } from './components/landing/Overview.js';
import { Problem } from './components/landing/Problem.js';
import { Solution } from './components/landing/Solution.js';
import { Architecture } from './components/landing/Architecture.js';
import { HowItWorks } from './components/landing/HowItWorks.js';
import { Footer } from './components/landing/Footer.js';
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
      {/* 1. Navigation Header */}
      <Nav isConnected={isConnected} apiBase={apiBase} />

      <main style={{ flex: 1 }}>
        {/* 2. Hero Section */}
        <Hero
          activeAgent={activeAgent}
          isConnected={isConnected}
          onScenarioTriggered={loadData}
        />

        {/* 3. Overview Section */}
        <Overview />

        {/* 4. Problem Section */}
        <Problem />

        {/* 5. Solution Section */}
        <Solution />

        {/* 6. Architecture Section */}
        <Architecture />

        {/* 7. How It Works Section */}
        <HowItWorks />

        {/* 8. Live Section: Real-time Autonomy Console */}
        <section id="live" className="live-section">
          <span id="evaluator" style={{ position: 'relative', top: '-80px', display: 'block' }}></span>
          <span id="activity-feed" style={{ position: 'relative', top: '-80px', display: 'block' }}></span>
          <div className="wrap">
            <div className="section-head">
              <div className="eyebrow">Live Controller</div>
              <h2>Real-time Autonomy & Telemetry Console</h2>
              <p>
                Inspect active agent state, watch dynamic authority level adjustments in real time,
                and explore full factor breakdowns for every payment proposal.
              </p>
            </div>

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
                <span>
                  Controller unreachable on {apiBase}. Start with <code>pnpm dev:controller</code> to stream live state.
                </span>
              </div>
            )}

            <div className="live-grid">
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
                    onActionUpdated={(updated) => {
                      setActions((prev) => prev.map((a) => (a.id === updated.id ? updated : a)));
                      setSelectedRecord(updated);
                    }}
                  />
                )}
              </div>
            </div>
          </div>
        </section>
      </main>

      {/* 9. Footer */}
      <Footer />
    </div>
  );
};
