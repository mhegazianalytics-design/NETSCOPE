-- Migration 002: Query Optimization Indexes for NETSCOPE

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
