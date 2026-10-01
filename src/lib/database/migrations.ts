/**
 * NETSCOPE SQLite Migration Runner
 * Enforces versioned, ordered, and idempotent schema migrations.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';

export interface MigrationRecord {
  version: number;
  name: string;
  sql: string;
}

export const EMBEDDED_MIGRATIONS: MigrationRecord[] = [
  {
    version: 1,
    name: '001_initial_schema',
    sql: `
CREATE TABLE IF NOT EXISTS schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS scans (
    id TEXT PRIMARY KEY,
    target TEXT NOT NULL,
    profile TEXT NOT NULL,
    profile_name TEXT NOT NULL,
    execution_mode TEXT NOT NULL DEFAULT 'mock',
    status TEXT NOT NULL,
    started_at TEXT NOT NULL,
    completed_at TEXT,
    duration_ms INTEGER DEFAULT 0,
    host_count INTEGER DEFAULT 0,
    open_port_count INTEGER DEFAULT 0,
    changes_detected INTEGER DEFAULT 0,
    xml_artifact_path TEXT,
    error_message TEXT,
    created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS hosts (
    id TEXT PRIMARY KEY,
    ip TEXT NOT NULL UNIQUE,
    hostname TEXT,
    mac TEXT,
    vendor TEXT,
    status TEXT NOT NULL DEFAULT 'up',
    os_match TEXT,
    os_accuracy INTEGER,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS ports (
    id TEXT PRIMARY KEY,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    host_ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'tcp',
    state TEXT NOT NULL DEFAULT 'open',
    service TEXT NOT NULL,
    product TEXT,
    version TEXT,
    extra_info TEXT,
    first_seen TEXT NOT NULL,
    last_seen TEXT NOT NULL,
    UNIQUE(host_id, port, protocol)
);

CREATE TABLE IF NOT EXISTS services (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL UNIQUE,
    default_port INTEGER,
    protocol TEXT NOT NULL DEFAULT 'tcp',
    description TEXT
);

CREATE TABLE IF NOT EXISTS scan_hosts (
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    host_ip TEXT NOT NULL,
    status TEXT NOT NULL DEFAULT 'up',
    observed_at TEXT NOT NULL,
    PRIMARY KEY (scan_id, host_id)
);

CREATE TABLE IF NOT EXISTS scan_ports (
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    host_id TEXT NOT NULL REFERENCES hosts(id) ON DELETE CASCADE,
    host_ip TEXT NOT NULL,
    port INTEGER NOT NULL,
    protocol TEXT NOT NULL DEFAULT 'tcp',
    state TEXT NOT NULL DEFAULT 'open',
    service TEXT NOT NULL,
    product TEXT,
    version TEXT,
    observed_at TEXT NOT NULL,
    PRIMARY KEY (scan_id, host_id, port, protocol)
);

CREATE TABLE IF NOT EXISTS scan_changes (
    id TEXT PRIMARY KEY,
    scan_id TEXT NOT NULL REFERENCES scans(id) ON DELETE CASCADE,
    target TEXT NOT NULL,
    host_id TEXT,
    host_ip TEXT NOT NULL,
    port INTEGER,
    protocol TEXT,
    change_type TEXT NOT NULL,
    previous_value TEXT,
    current_value TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'info',
    timestamp TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS monitoring_jobs (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    target TEXT NOT NULL,
    profile_id TEXT NOT NULL,
    interval_seconds INTEGER NOT NULL DEFAULT 60,
    watch_ports TEXT NOT NULL DEFAULT '[]',
    enabled INTEGER NOT NULL DEFAULT 1,
    status TEXT NOT NULL DEFAULT 'active',
    last_run_at TEXT,
    next_run_at TEXT,
    total_runs INTEGER DEFAULT 0,
    detected_changes_count INTEGER DEFAULT 0,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS port_watchlist (
    id TEXT PRIMARY KEY,
    port INTEGER NOT NULL UNIQUE,
    protocol TEXT NOT NULL DEFAULT 'tcp',
    service_name TEXT NOT NULL,
    description TEXT,
    enabled INTEGER NOT NULL DEFAULT 1,
    risk_note TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
);
`,
  },
  {
    version: 2,
    name: '002_scan_indexes',
    sql: `
CREATE INDEX IF NOT EXISTS idx_scans_created_at ON scans(created_at);
CREATE INDEX IF NOT EXISTS idx_scans_target ON scans(target);
CREATE INDEX IF NOT EXISTS idx_hosts_ip ON hosts(ip);
CREATE INDEX IF NOT EXISTS idx_hosts_last_seen ON hosts(last_seen);
CREATE INDEX IF NOT EXISTS idx_ports_port ON ports(port);
CREATE INDEX IF NOT EXISTS idx_ports_service ON ports(service);
CREATE INDEX IF NOT EXISTS idx_ports_host_id ON ports(host_id);
CREATE INDEX IF NOT EXISTS idx_scan_hosts_scan_id ON scan_hosts(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_hosts_host_id ON scan_hosts(host_id);
CREATE INDEX IF NOT EXISTS idx_scan_ports_scan_id ON scan_ports(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_ports_host_id ON scan_ports(host_id);
CREATE INDEX IF NOT EXISTS idx_scan_changes_scan_id ON scan_changes(scan_id);
CREATE INDEX IF NOT EXISTS idx_scan_changes_change_type ON scan_changes(change_type);
`,
  },
  {
    version: 3,
    name: '003_monitoring_engine',
    sql: `
ALTER TABLE monitoring_jobs ADD COLUMN scan_timeout_seconds INTEGER DEFAULT 120;
ALTER TABLE monitoring_jobs ADD COLUMN last_error TEXT;
ALTER TABLE monitoring_jobs ADD COLUMN failure_count INTEGER DEFAULT 0;
ALTER TABLE monitoring_jobs ADD COLUMN last_failure_at TEXT;
ALTER TABLE monitoring_jobs ADD COLUMN runtime_state TEXT DEFAULT 'idle';
ALTER TABLE monitoring_jobs ADD COLUMN current_scan_id TEXT;

CREATE TABLE IF NOT EXISTS monitoring_events (
    id TEXT PRIMARY KEY,
    monitoring_job_id TEXT NOT NULL REFERENCES monitoring_jobs(id) ON DELETE CASCADE,
    scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL,
    severity TEXT NOT NULL DEFAULT 'notice',
    host_id TEXT,
    host_ip TEXT NOT NULL,
    port INTEGER,
    protocol TEXT DEFAULT 'tcp',
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    acknowledged_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_monitoring_events_job_id ON monitoring_events(monitoring_job_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_scan_id ON monitoring_events(scan_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_created_at ON monitoring_events(created_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_event_type ON monitoring_events(event_type);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_ack ON monitoring_events(acknowledged_at);
`,
  },
];

export interface MigrationStatus {
  currentVersion: number;
  appliedCount: number;
  totalMigrations: number;
  appliedMigrations: { version: number; name: string; applied_at: string }[];
}

/**
 * Runs pending migrations on a SQLite DatabaseSync instance
 */
export function runMigrations(db: DatabaseSync): MigrationStatus {
  // 1. Ensure migrations tracking table exists
  db.exec(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL
    );
  `);

  // 2. Fetch already applied versions
  const stmt = db.prepare('SELECT version, name, applied_at FROM schema_migrations ORDER BY version ASC');
  const appliedRows = stmt.all() as { version: number; name: string; applied_at: string }[];
  const appliedVersionSet = new Set(appliedRows.map((r) => Number(r.version)));

  let newlyApplied = 0;

  // 3. Apply pending migrations in strict ascending order
  const pending = EMBEDDED_MIGRATIONS.filter((m) => !appliedVersionSet.has(m.version)).sort(
    (a, b) => a.version - b.version
  );

  const insertMigrationStmt = db.prepare(
    'INSERT INTO schema_migrations (version, name, applied_at) VALUES (?, ?, ?)'
  );

  for (const m of pending) {
    db.exec('BEGIN TRANSACTION');
    try {
      db.exec(m.sql);
      insertMigrationStmt.run(m.version, m.name, new Date().toISOString());
      db.exec('COMMIT');
      newlyApplied++;
      appliedRows.push({
        version: m.version,
        name: m.name,
        applied_at: new Date().toISOString(),
      });
    } catch (err) {
      db.exec('ROLLBACK');
      throw new Error(`Failed to apply migration ${m.name} (v${m.version}): ${(err as Error).message}`);
    }
  }

  const currentVersion = appliedRows.length > 0 ? Math.max(...appliedRows.map((r) => r.version)) : 0;

  return {
    currentVersion,
    appliedCount: newlyApplied,
    totalMigrations: EMBEDDED_MIGRATIONS.length,
    appliedMigrations: appliedRows,
  };
}
