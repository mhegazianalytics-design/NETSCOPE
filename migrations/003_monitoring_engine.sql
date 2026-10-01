-- Migration 003: Monitoring Engine Schema & Event Tracking for NETSCOPE
-- Adds operational state tracking to monitoring_jobs and creates monitoring_events table

-- 1. Extend monitoring_jobs with runtime execution and failure tracking
ALTER TABLE monitoring_jobs ADD COLUMN scan_timeout_seconds INTEGER DEFAULT 120;
ALTER TABLE monitoring_jobs ADD COLUMN last_error TEXT;
ALTER TABLE monitoring_jobs ADD COLUMN failure_count INTEGER DEFAULT 0;
ALTER TABLE monitoring_jobs ADD COLUMN last_failure_at TEXT;
ALTER TABLE monitoring_jobs ADD COLUMN runtime_state TEXT DEFAULT 'idle';
ALTER TABLE monitoring_jobs ADD COLUMN current_scan_id TEXT;

-- 2. Monitoring Events Table
-- Stores high-level change events and operational alerts derived from scan deltas
CREATE TABLE IF NOT EXISTS monitoring_events (
    id TEXT PRIMARY KEY,
    monitoring_job_id TEXT NOT NULL REFERENCES monitoring_jobs(id) ON DELETE CASCADE,
    scan_id TEXT REFERENCES scans(id) ON DELETE CASCADE,
    event_type TEXT NOT NULL, -- NEW_HOST, REMOVED_HOST, PORT_OPENED, PORT_CLOSED, SERVICE_CHANGED, VERSION_CHANGED, SCAN_FAILED
    severity TEXT NOT NULL DEFAULT 'notice', -- info, notice, warning (no vulnerability exploitability labels)
    host_id TEXT,
    host_ip TEXT NOT NULL,
    port INTEGER,
    protocol TEXT DEFAULT 'tcp',
    description TEXT NOT NULL,
    created_at TEXT NOT NULL,
    acknowledged_at TEXT
);

-- 3. Query Optimization Indexes
CREATE INDEX IF NOT EXISTS idx_monitoring_events_job_id ON monitoring_events(monitoring_job_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_scan_id ON monitoring_events(scan_id);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_created_at ON monitoring_events(created_at);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_event_type ON monitoring_events(event_type);
CREATE INDEX IF NOT EXISTS idx_monitoring_events_ack ON monitoring_events(acknowledged_at);
