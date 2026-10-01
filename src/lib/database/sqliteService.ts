/**
 * NETSCOPE SQLite Database Service
 * Native local SQLite persistence engine with transactional integrity,
 * versioned migrations, and comprehensive scan indexing.
 */

import { DatabaseSync } from 'node:sqlite';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { runMigrations, MigrationStatus } from './migrations';
import { Host, MonitoringEvent, MonitoringJob, NetscopeSettings, Port, PortWatchlistItem, Scan, ScanChange } from '../../types';
import { DEFAULT_PORT_WATCHLIST } from '../nmap/watchlist';
import {
  INITIAL_MOCK_CHANGES,
  INITIAL_MOCK_HOSTS,
  INITIAL_MOCK_MONITORING_JOBS,
  INITIAL_MOCK_PORTS,
  INITIAL_MOCK_SCANS,
} from '../parser/sampleData';

export interface DashboardMetrics {
  totalHosts: number;
  onlineHosts: number;
  openPorts: number;
  distinctServices: number;
  activeJobs: number;
  newChanges: number;
  totalScans: number;
  unacknowledgedEventsCount: number;
  recentEvents: MonitoringEvent[];
  lastScan?: {
    id: string;
    target: string;
    profile: string;
    startedAt: string;
    completedAt?: string;
  };
}

export interface IngestScanPayload {
  scan: Scan;
  hosts: Host[];
  ports: Port[];
  changes: ScanChange[];
  executionMode?: 'mock' | 'native';
  xmlArtifactPath?: string;
}

export class SQLiteService {
  private db: DatabaseSync | null = null;
  private dbPath: string;
  private migrationStatus: MigrationStatus | null = null;

  constructor(customPath?: string) {
    this.dbPath = customPath || this.resolveDefaultDbPath();
  }

  public resolveDefaultDbPath(): string {
    if (process.env.NETSCOPE_DB_PATH) {
      return path.resolve(process.env.NETSCOPE_DB_PATH);
    }

    // Windows Application Data: %APPDATA%/NETSCOPE/data/netscope.db
    if (process.platform === 'win32' && process.env.APPDATA) {
      return path.join(process.env.APPDATA, 'NETSCOPE', 'data', 'netscope.db');
    }

    // POSIX or Fallback: ~/.netscope/netscope.db or ./data/netscope.db
    const homeDir = os.homedir();
    if (homeDir) {
      return path.join(homeDir, '.netscope', 'netscope.db');
    }

    return path.resolve(process.cwd(), 'data', 'netscope.db');
  }

  public getDbPath(): string {
    return this.dbPath;
  }

  public initialize(): { connected: boolean; path: string; migrationStatus: MigrationStatus } {
    if (this.db) {
      return {
        connected: true,
        path: this.dbPath,
        migrationStatus: this.migrationStatus!,
      };
    }

    const dir = path.dirname(this.dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    this.db = new DatabaseSync(this.dbPath);
    // Enable foreign keys
    this.db.exec('PRAGMA foreign_keys = ON;');
    this.db.exec('PRAGMA journal_mode = WAL;');

    // Run migrations
    this.migrationStatus = runMigrations(this.db);

    // Seed initial records if empty
    this.seedInitialDataIfEmpty();

    return {
      connected: true,
      path: this.dbPath,
      migrationStatus: this.migrationStatus,
    };
  }

  private seedInitialDataIfEmpty() {
    const hostCountRow = this.db!.prepare('SELECT COUNT(*) as count FROM hosts').get() as { count: number };
    if (hostCountRow && hostCountRow.count === 0) {
      this.seedSampleData();
    }
  }

  public seedSampleData() {
    this.executeTransaction(() => {
      // 1. Seed Hosts
      const insertHost = this.db!.prepare(`
        INSERT OR REPLACE INTO hosts (id, ip, hostname, mac, vendor, status, os_match, os_accuracy, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const h of INITIAL_MOCK_HOSTS) {
        insertHost.run(h.id, h.ip, h.hostname || null, h.mac || null, h.vendor || null, h.status, h.osMatch || null, h.osAccuracy || null, h.firstSeen, h.lastSeen);
      }

      // 2. Seed Ports
      const insertPort = this.db!.prepare(`
        INSERT OR REPLACE INTO ports (id, host_id, host_ip, port, protocol, state, service, product, version, extra_info, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of INITIAL_MOCK_PORTS) {
        insertPort.run(p.id, p.hostId, p.hostIp, p.port, p.protocol, p.state, p.service, p.product || null, p.version || null, p.extraInfo || null, p.firstSeen, p.lastSeen);
      }

      // 3. Seed Scans
      const insertScan = this.db!.prepare(`
        INSERT OR REPLACE INTO scans (id, target, profile, profile_name, execution_mode, status, started_at, completed_at, duration_ms, host_count, open_port_count, changes_detected, xml_artifact_path, error_message, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const s of INITIAL_MOCK_SCANS) {
        insertScan.run(
          s.id,
          s.target,
          s.profileId,
          s.profileName,
          'mock',
          s.status,
          s.startedAt,
          s.completedAt || null,
          (s.durationSeconds || 0) * 1000,
          s.hostsDiscovered,
          s.openPortsDiscovered,
          s.changesDetected,
          s.rawOutputPath || null,
          s.errorMessage || null,
          s.startedAt
        );
      }

      // 4. Seed Changes
      const insertChange = this.db!.prepare(`
        INSERT OR REPLACE INTO scan_changes (id, scan_id, target, host_id, host_ip, port, protocol, change_type, previous_value, current_value, severity, timestamp)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of INITIAL_MOCK_CHANGES) {
        insertChange.run(c.id, c.scanId, c.target, null, c.hostIp, c.port || null, c.protocol || null, c.changeType, c.previousValue || null, c.currentValue, c.severity, c.timestamp);
      }

      // 5. Seed Monitoring Jobs
      const insertJob = this.db!.prepare(`
        INSERT OR REPLACE INTO monitoring_jobs (id, name, target, profile_id, interval_seconds, watch_ports, enabled, status, last_run_at, next_run_at, total_runs, detected_changes_count, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const j of INITIAL_MOCK_MONITORING_JOBS) {
        insertJob.run(
          j.id,
          j.name,
          j.target,
          j.profileId,
          j.intervalSeconds,
          JSON.stringify(j.watchPorts),
          1,
          j.status,
          j.lastRunAt || null,
          j.nextRunAt || null,
          j.totalRuns,
          j.detectedChangesCount,
          j.createdAt,
          j.createdAt
        );
      }

      // 6. Seed Watchlist
      const insertWatch = this.db!.prepare(`
        INSERT OR REPLACE INTO port_watchlist (id, port, protocol, service_name, description, enabled, risk_note, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      const now = new Date().toISOString();
      for (const w of DEFAULT_PORT_WATCHLIST) {
        insertWatch.run(w.id, w.port, w.protocol, w.serviceName, w.description, w.enabled ? 1 : 0, w.riskNote, now, now);
      }
    });
  }

  public executeTransaction<T>(action: () => T): T {
    this.ensureInitialized();
    this.db!.exec('BEGIN TRANSACTION;');
    try {
      const res = action();
      this.db!.exec('COMMIT;');
      return res;
    } catch (err) {
      this.db!.exec('ROLLBACK;');
      throw err;
    }
  }

  private ensureInitialized() {
    if (!this.db) {
      this.initialize();
    }
  }

  // --- SCAN INGESTION SERVICE (ATOMIC) ---
  public ingestScan(payload: IngestScanPayload): Scan {
    const { scan, hosts, ports, changes, executionMode = 'mock', xmlArtifactPath } = payload;
    const now = new Date().toISOString();

    return this.executeTransaction(() => {
      // 1. Insert scan record
      const insertScanStmt = this.db!.prepare(`
        INSERT OR REPLACE INTO scans (
          id, target, profile, profile_name, execution_mode, status, started_at, completed_at,
          duration_ms, host_count, open_port_count, changes_detected, xml_artifact_path, error_message, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      const durationMs = scan.durationSeconds ? scan.durationSeconds * 1000 : 0;
      insertScanStmt.run(
        scan.id,
        scan.target,
        scan.profileId,
        scan.profileName,
        executionMode,
        scan.status,
        scan.startedAt,
        scan.completedAt || now,
        durationMs,
        hosts.length,
        ports.filter((p) => p.state === 'open').length,
        changes.length,
        xmlArtifactPath || scan.rawOutputPath || null,
        scan.errorMessage || null,
        now
      );

      // 2. Upsert Hosts
      const upsertHostStmt = this.db!.prepare(`
        INSERT INTO hosts (id, ip, hostname, mac, vendor, status, os_match, os_accuracy, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(ip) DO UPDATE SET
          hostname = COALESCE(excluded.hostname, hosts.hostname),
          mac = COALESCE(excluded.mac, hosts.mac),
          vendor = COALESCE(excluded.vendor, hosts.vendor),
          status = excluded.status,
          os_match = COALESCE(excluded.os_match, hosts.os_match),
          os_accuracy = COALESCE(excluded.os_accuracy, hosts.os_accuracy),
          last_seen = excluded.last_seen
      `);

      for (const h of hosts) {
        upsertHostStmt.run(
          h.id,
          h.ip,
          h.hostname || null,
          h.mac || null,
          h.vendor || null,
          h.status,
          h.osMatch || null,
          h.osAccuracy || null,
          h.firstSeen || now,
          h.lastSeen || now
        );
      }

      // Build map of actual host IDs by IP from database
      const allHostRows = this.db!.prepare('SELECT id, ip FROM hosts').all() as { id: string; ip: string }[];
      const ipToHostId = new Map<string, string>(allHostRows.map((r) => [r.ip, r.id]));

      // 3. Upsert Ports
      const upsertPortStmt = this.db!.prepare(`
        INSERT INTO ports (id, host_id, host_ip, port, protocol, state, service, product, version, extra_info, first_seen, last_seen)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(host_id, port, protocol) DO UPDATE SET
          state = excluded.state,
          service = excluded.service,
          product = COALESCE(excluded.product, ports.product),
          version = COALESCE(excluded.version, ports.version),
          extra_info = COALESCE(excluded.extra_info, ports.extra_info),
          last_seen = excluded.last_seen
      `);

      for (const p of ports) {
        const resolvedHostId = ipToHostId.get(p.hostIp) || p.hostId;
        upsertPortStmt.run(
          p.id,
          resolvedHostId,
          p.hostIp,
          p.port,
          p.protocol,
          p.state,
          p.service,
          p.product || null,
          p.version || null,
          p.extraInfo || null,
          p.firstSeen || now,
          p.lastSeen || now
        );
      }

      // 4. Record Scan-Host relationship (Immutable snapshot)
      const insertScanHostStmt = this.db!.prepare(`
        INSERT OR REPLACE INTO scan_hosts (scan_id, host_id, host_ip, status, observed_at)
        VALUES (?, ?, ?, ?, ?)
      `);
      for (const h of hosts) {
        const resolvedHostId = ipToHostId.get(h.ip) || h.id;
        insertScanHostStmt.run(scan.id, resolvedHostId, h.ip, h.status, now);
      }

      // 5. Record Scan-Port relationship (Immutable snapshot)
      const insertScanPortStmt = this.db!.prepare(`
        INSERT OR REPLACE INTO scan_ports (scan_id, host_id, host_ip, port, protocol, state, service, product, version, observed_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const p of ports) {
        const resolvedHostId = ipToHostId.get(p.hostIp) || p.hostId;
        insertScanPortStmt.run(
          scan.id,
          resolvedHostId,
          p.hostIp,
          p.port,
          p.protocol,
          p.state,
          p.service,
          p.product || null,
          p.version || null,
          now
        );
      }

      // 6. Record Scan Changes
      const insertChangeStmt = this.db!.prepare(`
        INSERT OR REPLACE INTO scan_changes (
          id, scan_id, target, host_id, host_ip, port, protocol, change_type, previous_value, current_value, severity, timestamp
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const c of changes) {
        insertChangeStmt.run(
          c.id,
          scan.id,
          c.target,
          null,
          c.hostIp,
          c.port || null,
          c.protocol || null,
          c.changeType,
          c.previousValue || null,
          c.currentValue,
          c.severity,
          c.timestamp || now
        );
      }

      return {
        ...scan,
        hostsDiscovered: hosts.length,
        openPortsDiscovered: ports.filter((p) => p.state === 'open').length,
        changesDetected: changes.length,
        rawOutputPath: xmlArtifactPath || scan.rawOutputPath,
      };
    });
  }

  // --- QUERY APIS ---
  public listScans(options?: {
    search?: string;
    status?: string;
    target?: string;
    limit?: number;
    offset?: number;
  }): { scans: Scan[]; total: number } {
    this.ensureInitialized();
    const limit = options?.limit || 50;
    const offset = options?.offset || 0;

    let whereClause = '1=1';
    const params: any[] = [];

    if (options?.search) {
      whereClause += ' AND (target LIKE ? OR profile_name LIKE ?)';
      params.push(`%${options.search}%`, `%${options.search}%`);
    }

    if (options?.status && options.status !== 'all') {
      whereClause += ' AND status = ?';
      params.push(options.status);
    }

    if (options?.target) {
      whereClause += ' AND target = ?';
      params.push(options.target);
    }

    const countRow = this.db!.prepare(`SELECT COUNT(*) as count FROM scans WHERE ${whereClause}`).get(...params) as { count: number };
    const total = countRow ? countRow.count : 0;

    const rows = this.db!.prepare(`
      SELECT * FROM scans
      WHERE ${whereClause}
      ORDER BY started_at DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset) as any[];

    const scans: Scan[] = rows.map((r) => ({
      id: r.id,
      target: r.target,
      profileId: r.profile as any,
      profileName: r.profile_name,
      startedAt: r.started_at,
      completedAt: r.completed_at || undefined,
      durationSeconds: r.duration_ms ? Math.floor(r.duration_ms / 1000) : undefined,
      status: r.status as any,
      hostsDiscovered: r.host_count,
      openPortsDiscovered: r.open_port_count,
      changesDetected: r.changes_detected,
      rawOutputPath: r.xml_artifact_path || undefined,
      errorMessage: r.error_message || undefined,
    }));

    return { scans, total };
  }

  public getScanDetails(id: string): {
    scan: Scan;
    observedHosts: Host[];
    observedPorts: Port[];
    changes: ScanChange[];
  } | null {
    this.ensureInitialized();
    const scanRow = this.db!.prepare('SELECT * FROM scans WHERE id = ?').get(id) as any;
    if (!scanRow) return null;

    const scan: Scan = {
      id: scanRow.id,
      target: scanRow.target,
      profileId: scanRow.profile,
      profileName: scanRow.profile_name,
      startedAt: scanRow.started_at,
      completedAt: scanRow.completed_at || undefined,
      durationSeconds: scanRow.duration_ms ? Math.floor(scanRow.duration_ms / 1000) : undefined,
      status: scanRow.status,
      hostsDiscovered: scanRow.host_count,
      openPortsDiscovered: scanRow.open_port_count,
      changesDetected: scanRow.changes_detected,
      rawOutputPath: scanRow.xml_artifact_path || undefined,
      errorMessage: scanRow.error_message || undefined,
    };

    // Observed Hosts from scan_hosts junction
    const hostRows = this.db!.prepare(`
      SELECT sh.host_id, sh.host_ip, sh.status, sh.observed_at,
             h.hostname, h.mac, h.vendor, h.os_match, h.os_accuracy, h.first_seen, h.last_seen
      FROM scan_hosts sh
      LEFT JOIN hosts h ON sh.host_id = h.id
      WHERE sh.scan_id = ?
    `).all(id) as any[];

    const observedHosts: Host[] = hostRows.map((r) => ({
      id: r.host_id,
      ip: r.host_ip,
      hostname: r.hostname || undefined,
      mac: r.mac || undefined,
      vendor: r.vendor || undefined,
      status: r.status,
      osMatch: r.os_match || undefined,
      osAccuracy: r.os_accuracy || undefined,
      firstSeen: r.first_seen || r.observed_at,
      lastSeen: r.last_seen || r.observed_at,
      openPortsCount: 0,
    }));

    // Observed Ports from scan_ports junction
    const portRows = this.db!.prepare(`
      SELECT * FROM scan_ports WHERE scan_id = ?
    `).all(id) as any[];

    const observedPorts: Port[] = portRows.map((r) => ({
      id: `port-${r.host_ip.replace(/[.:]/g, '-')}-${r.port}-${r.protocol}`,
      hostId: r.host_id,
      hostIp: r.host_ip,
      port: r.port,
      protocol: r.protocol,
      state: r.state,
      service: r.service,
      product: r.product || undefined,
      version: r.version || undefined,
      firstSeen: r.observed_at,
      lastSeen: r.observed_at,
    }));

    // Changes recorded in this scan
    const changeRows = this.db!.prepare(`
      SELECT * FROM scan_changes WHERE scan_id = ?
    `).all(id) as any[];

    const changes: ScanChange[] = changeRows.map((r) => ({
      id: r.id,
      scanId: r.scan_id,
      target: r.target,
      hostIp: r.host_ip,
      port: r.port || undefined,
      protocol: r.protocol || undefined,
      changeType: r.change_type,
      previousValue: r.previous_value || undefined,
      currentValue: r.current_value,
      severity: r.severity,
      timestamp: r.timestamp,
    }));

    return { scan, observedHosts, observedPorts, changes };
  }

  public listHosts(): Host[] {
    this.ensureInitialized();
    const rows = this.db!.prepare(`
      SELECT h.*, COUNT(CASE WHEN p.state = 'open' THEN 1 END) as open_ports_count
      FROM hosts h
      LEFT JOIN ports p ON h.id = p.host_id
      GROUP BY h.id
      ORDER BY h.last_seen DESC
    `).all() as any[];

    return rows.map((r) => ({
      id: r.id,
      ip: r.ip,
      hostname: r.hostname || undefined,
      mac: r.mac || undefined,
      vendor: r.vendor || undefined,
      status: r.status,
      osMatch: r.os_match || undefined,
      osAccuracy: r.os_accuracy || undefined,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
      openPortsCount: Number(r.open_ports_count || 0),
    }));
  }

  public getHostDetails(id: string): {
    host: Host;
    ports: Port[];
    scans: { scanId: string; target: string; observedAt: string }[];
    changes: ScanChange[];
  } | null {
    this.ensureInitialized();
    const hostRow = this.db!.prepare('SELECT * FROM hosts WHERE id = ? OR ip = ?').get(id, id) as any;
    if (!hostRow) return null;

    const portRows = this.db!.prepare('SELECT * FROM ports WHERE host_id = ?').all(hostRow.id) as any[];
    const ports: Port[] = portRows.map((r) => ({
      id: r.id,
      hostId: r.host_id,
      hostIp: r.host_ip,
      port: r.port,
      protocol: r.protocol,
      state: r.state,
      service: r.service,
      product: r.product || undefined,
      version: r.version || undefined,
      extraInfo: r.extra_info || undefined,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }));

    const scanRows = this.db!.prepare(`
      SELECT sh.scan_id, s.target, sh.observed_at
      FROM scan_hosts sh
      JOIN scans s ON sh.scan_id = s.id
      WHERE sh.host_id = ?
      ORDER BY sh.observed_at DESC
    `).all(hostRow.id) as any[];

    const changeRows = this.db!.prepare('SELECT * FROM scan_changes WHERE host_ip = ? ORDER BY timestamp DESC').all(hostRow.ip) as any[];
    const changes: ScanChange[] = changeRows.map((r) => ({
      id: r.id,
      scanId: r.scan_id,
      target: r.target,
      hostIp: r.host_ip,
      port: r.port || undefined,
      protocol: r.protocol || undefined,
      changeType: r.change_type,
      previousValue: r.previous_value || undefined,
      currentValue: r.current_value,
      severity: r.severity,
      timestamp: r.timestamp,
    }));

    const host: Host = {
      id: hostRow.id,
      ip: hostRow.ip,
      hostname: hostRow.hostname || undefined,
      mac: hostRow.mac || undefined,
      vendor: hostRow.vendor || undefined,
      status: hostRow.status,
      osMatch: hostRow.os_match || undefined,
      osAccuracy: hostRow.os_accuracy || undefined,
      firstSeen: hostRow.first_seen,
      lastSeen: hostRow.last_seen,
      openPortsCount: ports.filter((p) => p.state === 'open').length,
    };

    return {
      host,
      ports,
      scans: scanRows.map((r) => ({ scanId: r.scan_id, target: r.target, observedAt: r.observed_at })),
      changes,
    };
  }

  public listPorts(): Port[] {
    this.ensureInitialized();
    const rows = this.db!.prepare('SELECT * FROM ports ORDER BY port ASC, protocol ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      hostId: r.host_id,
      hostIp: r.host_ip,
      port: r.port,
      protocol: r.protocol,
      state: r.state,
      service: r.service,
      product: r.product || undefined,
      version: r.version || undefined,
      extraInfo: r.extra_info || undefined,
      firstSeen: r.first_seen,
      lastSeen: r.last_seen,
    }));
  }

  public listChanges(scanId?: string): ScanChange[] {
    this.ensureInitialized();
    const sql = scanId
      ? 'SELECT * FROM scan_changes WHERE scan_id = ? ORDER BY timestamp DESC'
      : 'SELECT * FROM scan_changes ORDER BY timestamp DESC LIMIT 100';
    const rows = (scanId ? this.db!.prepare(sql).all(scanId) : this.db!.prepare(sql).all()) as any[];

    return rows.map((r) => ({
      id: r.id,
      scanId: r.scan_id,
      target: r.target,
      hostIp: r.host_ip,
      port: r.port || undefined,
      protocol: r.protocol || undefined,
      changeType: r.change_type,
      previousValue: r.previous_value || undefined,
      currentValue: r.current_value,
      severity: r.severity,
      timestamp: r.timestamp,
    }));
  }

  public getDashboardMetrics(): DashboardMetrics {
    this.ensureInitialized();
    const totalHostsRow = this.db!.prepare('SELECT COUNT(*) as c FROM hosts').get() as { c: number };
    const onlineHostsRow = this.db!.prepare("SELECT COUNT(*) as c FROM hosts WHERE status = 'up'").get() as { c: number };
    const openPortsRow = this.db!.prepare("SELECT COUNT(*) as c FROM ports WHERE state = 'open'").get() as { c: number };
    const servicesRow = this.db!.prepare("SELECT COUNT(DISTINCT service) as c FROM ports WHERE state = 'open'").get() as { c: number };
    const activeJobsRow = this.db!.prepare("SELECT COUNT(*) as c FROM monitoring_jobs WHERE status = 'active'").get() as { c: number };
    const changesRow = this.db!.prepare('SELECT COUNT(*) as c FROM scan_changes').get() as { c: number };
    const scansRow = this.db!.prepare('SELECT COUNT(*) as c FROM scans').get() as { c: number };
    const lastScanRow = this.db!.prepare('SELECT id, target, profile_name, started_at, completed_at FROM scans ORDER BY started_at DESC LIMIT 1').get() as any;

    let unacknowledgedEventsCount = 0;
    let recentEvents: MonitoringEvent[] = [];
    try {
      const ackRow = this.db!.prepare('SELECT COUNT(*) as c FROM monitoring_events WHERE acknowledged_at IS NULL').get() as { c: number };
      unacknowledgedEventsCount = ackRow?.c || 0;
      recentEvents = this.listMonitoringEvents({ limit: 10 });
    } catch {
      // Table might not exist yet during migration
    }

    return {
      totalHosts: totalHostsRow?.c || 0,
      onlineHosts: onlineHostsRow?.c || 0,
      openPorts: openPortsRow?.c || 0,
      distinctServices: servicesRow?.c || 0,
      activeJobs: activeJobsRow?.c || 0,
      newChanges: changesRow?.c || 0,
      totalScans: scansRow?.c || 0,
      unacknowledgedEventsCount,
      recentEvents,
      lastScan: lastScanRow
        ? {
            id: lastScanRow.id,
            target: lastScanRow.target,
            profile: lastScanRow.profile_name,
            startedAt: lastScanRow.started_at,
            completedAt: lastScanRow.completed_at || undefined,
          }
        : undefined,
    };
  }

  public getMonitoringJobs(): MonitoringJob[] {
    this.ensureInitialized();
    const rows = this.db!.prepare('SELECT * FROM monitoring_jobs ORDER BY created_at DESC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      name: r.name,
      target: r.target,
      profileId: r.profile_id,
      intervalSeconds: r.interval_seconds,
      scanTimeoutSeconds: r.scan_timeout_seconds || 120,
      watchPorts: JSON.parse(r.watch_ports || '[]'),
      status: r.status,
      runtimeState: r.runtime_state || (r.status === 'active' ? 'idle' : r.status),
      lastRunAt: r.last_run_at || undefined,
      nextRunAt: r.next_run_at || undefined,
      totalRuns: r.total_runs || 0,
      detectedChangesCount: r.detected_changes_count || 0,
      failureCount: r.failure_count || 0,
      lastError: r.last_error || undefined,
      lastFailureAt: r.last_failure_at || undefined,
      currentScanId: r.current_scan_id || undefined,
      createdAt: r.created_at,
    }));
  }

  public upsertMonitoringJob(job: MonitoringJob): MonitoringJob {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const stmt = this.db!.prepare(`
      INSERT INTO monitoring_jobs (
        id, name, target, profile_id, interval_seconds, scan_timeout_seconds, watch_ports,
        enabled, status, runtime_state, last_run_at, next_run_at, total_runs,
        detected_changes_count, failure_count, last_error, last_failure_at, current_scan_id,
        created_at, updated_at
      )
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(id) DO UPDATE SET
        name = excluded.name,
        target = excluded.target,
        profile_id = excluded.profile_id,
        interval_seconds = excluded.interval_seconds,
        scan_timeout_seconds = excluded.scan_timeout_seconds,
        watch_ports = excluded.watch_ports,
        status = excluded.status,
        runtime_state = excluded.runtime_state,
        last_run_at = excluded.last_run_at,
        next_run_at = excluded.next_run_at,
        total_runs = excluded.total_runs,
        detected_changes_count = excluded.detected_changes_count,
        failure_count = excluded.failure_count,
        last_error = excluded.last_error,
        last_failure_at = excluded.last_failure_at,
        current_scan_id = excluded.current_scan_id,
        updated_at = excluded.updated_at
    `);

    stmt.run(
      job.id,
      job.name,
      job.target,
      job.profileId,
      job.intervalSeconds,
      job.scanTimeoutSeconds || 120,
      JSON.stringify(job.watchPorts || []),
      job.status === 'active' ? 1 : 0,
      job.status,
      job.runtimeState || 'idle',
      job.lastRunAt || null,
      job.nextRunAt || null,
      job.totalRuns || 0,
      job.detectedChangesCount || 0,
      job.failureCount || 0,
      job.lastError || null,
      job.lastFailureAt || null,
      job.currentScanId || null,
      job.createdAt || now,
      now
    );

    return job;
  }

  public updateMonitoringJobRuntime(id: string, update: Partial<MonitoringJob>): void {
    this.ensureInitialized();
    const fields: string[] = ['updated_at = ?'];
    const values: any[] = [new Date().toISOString()];

    if (update.status !== undefined) {
      fields.push('status = ?');
      values.push(update.status);
      fields.push('enabled = ?');
      values.push(update.status === 'active' ? 1 : 0);
    }
    if (update.runtimeState !== undefined) {
      fields.push('runtime_state = ?');
      values.push(update.runtimeState);
    }
    if (update.lastRunAt !== undefined) {
      fields.push('last_run_at = ?');
      values.push(update.lastRunAt);
    }
    if (update.nextRunAt !== undefined) {
      fields.push('next_run_at = ?');
      values.push(update.nextRunAt);
    }
    if (update.totalRuns !== undefined) {
      fields.push('total_runs = ?');
      values.push(update.totalRuns);
    }
    if (update.detectedChangesCount !== undefined) {
      fields.push('detected_changes_count = ?');
      values.push(update.detectedChangesCount);
    }
    if (update.failureCount !== undefined) {
      fields.push('failure_count = ?');
      values.push(update.failureCount);
    }
    if (update.lastError !== undefined) {
      fields.push('last_error = ?');
      values.push(update.lastError);
    }
    if (update.lastFailureAt !== undefined) {
      fields.push('last_failure_at = ?');
      values.push(update.lastFailureAt);
    }
    if (update.currentScanId !== undefined) {
      fields.push('current_scan_id = ?');
      values.push(update.currentScanId);
    }

    values.push(id);
    this.db!.prepare(`UPDATE monitoring_jobs SET ${fields.join(', ')} WHERE id = ?`).run(...values);
  }

  public deleteMonitoringJob(id: string): boolean {
    this.ensureInitialized();
    const stmt = this.db!.prepare('DELETE FROM monitoring_jobs WHERE id = ?');
    stmt.run(id);
    return true;
  }

  // --- MONITORING EVENTS OPERATIONS ---
  public createMonitoringEvent(event: MonitoringEvent): MonitoringEvent {
    this.ensureInitialized();
    const stmt = this.db!.prepare(`
      INSERT INTO monitoring_events (
        id, monitoring_job_id, scan_id, event_type, severity, host_id, host_ip, port, protocol, description, created_at, acknowledged_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      event.id,
      event.monitoringJobId,
      event.scanId && event.scanId !== 'none' ? event.scanId : null,
      event.eventType,
      event.severity,
      event.hostId || null,
      event.hostIp,
      event.port || null,
      event.protocol || 'tcp',
      event.description,
      event.createdAt,
      event.acknowledgedAt || null
    );

    return event;
  }

  public listMonitoringEvents(options?: {
    jobId?: string;
    unacknowledgedOnly?: boolean;
    limit?: number;
  }): MonitoringEvent[] {
    this.ensureInitialized();
    const limit = options?.limit || 50;
    let whereClause = '1=1';
    const params: any[] = [];

    if (options?.jobId) {
      whereClause += ' AND monitoring_job_id = ?';
      params.push(options.jobId);
    }

    if (options?.unacknowledgedOnly) {
      whereClause += ' AND acknowledged_at IS NULL';
    }

    const rows = this.db!.prepare(`
      SELECT * FROM monitoring_events
      WHERE ${whereClause}
      ORDER BY created_at DESC
      LIMIT ?
    `).all(...params, limit) as any[];

    return rows.map((r) => ({
      id: r.id,
      monitoringJobId: r.monitoring_job_id,
      scanId: r.scan_id,
      eventType: r.event_type,
      severity: r.severity,
      hostId: r.host_id || undefined,
      hostIp: r.host_ip,
      port: r.port || undefined,
      protocol: r.protocol || undefined,
      description: r.description,
      createdAt: r.created_at,
      acknowledgedAt: r.acknowledged_at || undefined,
    }));
  }

  public acknowledgeMonitoringEvent(id: string): boolean {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const stmt = this.db!.prepare('UPDATE monitoring_events SET acknowledged_at = ? WHERE id = ?');
    stmt.run(now, id);
    return true;
  }

  public acknowledgeAllMonitoringEvents(): number {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const res = this.db!.prepare('UPDATE monitoring_events SET acknowledged_at = ? WHERE acknowledged_at IS NULL').run(now);
    return Number((res as any)?.changes || 0);
  }

  public getWatchlist(): PortWatchlistItem[] {
    this.ensureInitialized();
    const rows = this.db!.prepare('SELECT * FROM port_watchlist ORDER BY port ASC').all() as any[];
    return rows.map((r) => ({
      id: r.id,
      port: r.port,
      protocol: r.protocol,
      serviceName: r.service_name,
      description: r.description || '',
      enabled: r.enabled === 1,
      riskNote: r.risk_note || '',
    }));
  }

  public upsertWatchlist(item: PortWatchlistItem): PortWatchlistItem {
    this.ensureInitialized();
    const now = new Date().toISOString();
    const stmt = this.db!.prepare(`
      INSERT INTO port_watchlist (id, port, protocol, service_name, description, enabled, risk_note, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      ON CONFLICT(port) DO UPDATE SET
        protocol = excluded.protocol,
        service_name = excluded.service_name,
        description = excluded.description,
        enabled = excluded.enabled,
        risk_note = excluded.risk_note,
        updated_at = excluded.updated_at
    `);
    stmt.run(item.id, item.port, item.protocol, item.serviceName, item.description, item.enabled ? 1 : 0, item.riskNote, now, now);
    return item;
  }

  public getSettings(): NetscopeSettings | null {
    this.ensureInitialized();
    const row = this.db!.prepare("SELECT value FROM settings WHERE key = 'app_settings'").get() as any;
    if (row && row.value) {
      try {
        return JSON.parse(row.value);
      } catch {
        return null;
      }
    }
    return null;
  }

  public saveSettings(settings: NetscopeSettings): void {
    this.ensureInitialized();
    const stmt = this.db!.prepare(`
      INSERT INTO settings (key, value) VALUES ('app_settings', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `);
    stmt.run(JSON.stringify(settings));
  }

  public backupDatabase(targetFilePath?: string): string {
    this.ensureInitialized();
    const destination = targetFilePath || `${this.dbPath}.backup-${Date.now()}`;
    fs.copyFileSync(this.dbPath, destination);
    return destination;
  }

  public resetDatabase(): void {
    this.ensureInitialized();
    this.db!.exec('BEGIN TRANSACTION;');
    try {
      this.db!.exec('DELETE FROM monitoring_events;');
      this.db!.exec('DELETE FROM scan_changes;');
      this.db!.exec('DELETE FROM scan_ports;');
      this.db!.exec('DELETE FROM scan_hosts;');
      this.db!.exec('DELETE FROM ports;');
      this.db!.exec('DELETE FROM hosts;');
      this.db!.exec('DELETE FROM scans;');
      this.db!.exec('DELETE FROM monitoring_jobs;');
      this.db!.exec('DELETE FROM port_watchlist;');
      this.db!.exec('DELETE FROM settings;');
      this.db!.exec('COMMIT;');
      this.seedSampleData();
    } catch (err) {
      this.db!.exec('ROLLBACK;');
      throw err;
    }
  }

  public close() {
    if (this.db) {
      this.db.close();
      this.db = null;
    }
  }
}

export const sqliteService = new SQLiteService();
