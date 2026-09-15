/**
 * SQLite Persistence Store
 * Persists AgentProfile, ActionRecord (with distinct authority level),
 * authority transition events, and policy violations.
 * Uses native node:sqlite DatabaseSync for zero-dependency high-speed persistence.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'node:fs';
import path from 'node:path';
import { AgentProfile, ActionRecord, AuthorityLevel } from '../types.js';

export interface AuthorityEvent {
  id?: number;
  agentId: string;
  fromLevel: AuthorityLevel;
  toLevel: AuthorityLevel;
  reason: string;
  timestamp: number;
}

export interface PolicyViolationRecord {
  id?: number;
  agentId: string;
  actionId: string;
  violations: string[];
  timestamp: number;
}

export class ThrottleStore {
  private db: DatabaseSync;

  constructor(dbPath: string = ':memory:') {
    if (dbPath !== ':memory:') {
      const dir = path.dirname(dbPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new DatabaseSync(dbPath);
    if (dbPath !== ':memory:') {
      this.db.exec('PRAGMA journal_mode = WAL;');
    }
    this.initSchema();
  }

  private initSchema(): void {
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS agents (
        agent_id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        current_authority_level INTEGER NOT NULL,
        data TEXT NOT NULL,
        updated_at INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS actions (
        id TEXT PRIMARY KEY,
        action_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        timestamp INTEGER NOT NULL,
        authority_level INTEGER NOT NULL,
        execution_status TEXT NOT NULL,
        data TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_actions_agent_time ON actions (agent_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS authority_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        from_level INTEGER NOT NULL,
        to_level INTEGER NOT NULL,
        reason TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_auth_events_agent ON authority_events (agent_id, timestamp DESC);

      CREATE TABLE IF NOT EXISTS policy_violations (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        action_id TEXT NOT NULL,
        violations TEXT NOT NULL,
        timestamp INTEGER NOT NULL
      );

      CREATE TABLE IF NOT EXISTS behavior_metrics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        agent_id TEXT NOT NULL,
        metric_key TEXT NOT NULL,
        metric_value REAL NOT NULL,
        timestamp INTEGER NOT NULL
      );
    `);
  }

  public saveAgent(profile: AgentProfile): void {
    const stmt = this.db.prepare(`
      INSERT INTO agents (agent_id, name, current_authority_level, data, updated_at)
      VALUES (?, ?, ?, ?, ?)
      ON CONFLICT(agent_id) DO UPDATE SET
        name = excluded.name,
        current_authority_level = excluded.current_authority_level,
        data = excluded.data,
        updated_at = excluded.updated_at;
    `);

    stmt.run(
      profile.agentId,
      profile.name,
      profile.currentAuthorityLevel,
      JSON.stringify(profile),
      Date.now()
    );
  }

  public getAgent(agentId: string): AgentProfile | null {
    const stmt = this.db.prepare(`
      SELECT data FROM agents WHERE agent_id = ?
    `);
    const row = stmt.get(agentId) as { data: string } | undefined;
    if (!row) return null;
    return JSON.parse(row.data) as AgentProfile;
  }

  public listAgents(): AgentProfile[] {
    const stmt = this.db.prepare(`
      SELECT data FROM agents ORDER BY updated_at DESC
    `);
    const rows = stmt.all() as Array<{ data: string }>;
    return rows.map((r) => JSON.parse(r.data) as AgentProfile);
  }

  public saveActionRecord(record: ActionRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO actions (id, action_id, agent_id, timestamp, authority_level, execution_status, data)
      VALUES (?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        execution_status = excluded.execution_status,
        data = excluded.data;
    `);

    stmt.run(
      record.id,
      record.actionId,
      record.agentId,
      record.timestamp,
      record.authorityLevel,
      record.executionStatus,
      JSON.stringify(record)
    );
  }

  public getActionRecords(agentId?: string, limit: number = 50): ActionRecord[] {
    if (agentId) {
      const stmt = this.db.prepare(`
        SELECT data FROM actions WHERE agent_id = ? ORDER BY timestamp DESC LIMIT ?
      `);
      const rows = stmt.all(agentId, limit) as Array<{ data: string }>;
      return rows.map((r) => JSON.parse(r.data) as ActionRecord);
    } else {
      const stmt = this.db.prepare(`
        SELECT data FROM actions ORDER BY timestamp DESC LIMIT ?
      `);
      const rows = stmt.all(limit) as Array<{ data: string }>;
      return rows.map((r) => JSON.parse(r.data) as ActionRecord);
    }
  }

  public recordAuthorityEvent(event: AuthorityEvent): void {
    const stmt = this.db.prepare(`
      INSERT INTO authority_events (agent_id, from_level, to_level, reason, timestamp)
      VALUES (?, ?, ?, ?, ?)
    `);
    stmt.run(
      event.agentId,
      event.fromLevel,
      event.toLevel,
      event.reason,
      event.timestamp || Date.now()
    );
  }

  public getAuthorityEvents(agentId?: string, limit: number = 20): AuthorityEvent[] {
    if (agentId) {
      const stmt = this.db.prepare(`
        SELECT id, agent_id as agentId, from_level as fromLevel, to_level as toLevel, reason, timestamp
        FROM authority_events
        WHERE agent_id = ?
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      return stmt.all(agentId, limit) as unknown as AuthorityEvent[];
    } else {
      const stmt = this.db.prepare(`
        SELECT id, agent_id as agentId, from_level as fromLevel, to_level as toLevel, reason, timestamp
        FROM authority_events
        ORDER BY timestamp DESC
        LIMIT ?
      `);
      return stmt.all(limit) as unknown as AuthorityEvent[];
    }
  }

  public recordPolicyViolation(violation: PolicyViolationRecord): void {
    const stmt = this.db.prepare(`
      INSERT INTO policy_violations (agent_id, action_id, violations, timestamp)
      VALUES (?, ?, ?, ?)
    `);
    stmt.run(
      violation.agentId,
      violation.actionId,
      JSON.stringify(violation.violations),
      violation.timestamp || Date.now()
    );
  }

  public close(): void {
    this.db.close();
  }
}
