-- Migration 001: Initial Schema for NETSCOPE
-- Authoritative local tables for network reconnaissance inventory and scans

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
