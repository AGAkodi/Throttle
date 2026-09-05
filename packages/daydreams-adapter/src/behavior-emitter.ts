/**
 * Behavior Emitter
 * Emits action events and execution telemetry from Daydreams agent runs to the Throttle Controller.
 * Tracks retry frequency, failure rates, and execution telemetry in real-time.
 */

import { ThrottleStore, AgentProfile } from '@throttle/controller';

export interface ActionTelemetryEvent {
  agentId: string;
  actionId: string;
  type: 'attempt' | 'success' | 'failure' | 'retry';
  error?: string;
  durationMs?: number;
  timestamp?: number;
}

export class BehaviorEmitter {
  private store: ThrottleStore;

  constructor(store: ThrottleStore) {
    this.store = store;
  }

  /**
   * Records an action telemetry event and updates live agent behavioral counters.
   */
  public emit(event: ActionTelemetryEvent): void {
    const profile = this.store.getAgent(event.agentId);
    if (!profile) return;

    const now = event.timestamp || Date.now();
    const metrics = { ...profile.metrics };

    switch (event.type) {
      case 'attempt':
        metrics.totalActions += 1;
        metrics.lastActionTimestamp = now;
        break;

      case 'success':
        metrics.successfulActions += 1;
        metrics.consecutiveSuccessfulActions += 1;
        metrics.recentRetries = 0; // reset retries on clean success
        break;

      case 'failure':
        metrics.failedActions += 1;
        metrics.consecutiveSuccessfulActions = 0;
        break;

      case 'retry':
        metrics.recentRetries += 1;
        break;
    }

    const updatedProfile: AgentProfile = {
      ...profile,
      metrics,
      updatedAt: now,
    };

    this.store.saveAgent(updatedProfile);
  }
}
