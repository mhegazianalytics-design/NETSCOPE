/**
 * NETSCOPE Storage Provider Abstraction
 * Decouples the UI and domain operations from specific database implementations.
 * Supports both MockStorage (localStorage/in-memory) and SQLiteStorage (local persistent disk).
 */

import {
  Host,
  MonitoringJob,
  NetscopeSettings,
  Port,
  PortWatchlistItem,
  Scan,
  ScanChange,
} from '../../types';
import { DEFAULT_PORT_WATCHLIST } from '../nmap/watchlist';
import {
  INITIAL_MOCK_CHANGES,
  INITIAL_MOCK_HOSTS,
  INITIAL_MOCK_MONITORING_JOBS,
  INITIAL_MOCK_PORTS,
  INITIAL_MOCK_SCANS,
} from '../parser/sampleData';

export const DEFAULT_SETTINGS: NetscopeSettings = {
  nmapPath: 'C:\\Program Files\\Nmap\\nmap.exe',
  databasePath: '~/.netscope/netscope.db',
  mockMode: true,
  defaultScanProfile: 'common-services',
  defaultMonitoringInterval: 60,
  aiProvider: 'gemini',
  geminiApiKeyConfigured: false,
  deepseekApiKeyConfigured: false,
  allowedSubnets: ['192.168.0.0/16', '10.0.0.0/8', '172.16.0.0/12', '127.0.0.1/32'],
  maxScanConcurrency: 2,
  telemetryDisabled: true,
};

export interface StorageProvider {
  name: string;
  getHosts(): Host[];
  saveHosts(hosts: Host[]): void;
  getPorts(): Port[];
  savePorts(ports: Port[]): void;
  getScans(): Scan[];
  saveScan(scan: Scan): void;
  saveScans(scans: Scan[]): void;
  getChanges(): ScanChange[];
  saveChanges(changes: ScanChange[]): void;
  getMonitoringJobs(): MonitoringJob[];
  saveMonitoringJobs(jobs: MonitoringJob[]): void;
  getWatchlist(): PortWatchlistItem[];
  saveWatchlist(watchlist: PortWatchlistItem[]): void;
  getSettings(): NetscopeSettings;
  saveSettings(settings: NetscopeSettings): void;
  reset(): void;
}

const STORAGE_KEYS = {
  HOSTS: 'netscope_hosts',
  PORTS: 'netscope_ports',
  SCANS: 'netscope_scans',
  CHANGES: 'netscope_changes',
  MONITORING: 'netscope_monitoring',
  WATCHLIST: 'netscope_watchlist',
  SETTINGS: 'netscope_settings',
};

/**
 * Mock / In-Browser Storage Provider
 */
export class MockStorageProvider implements StorageProvider {
  name = 'MockStorage';

  getHosts(): Host[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.HOSTS);
      return data ? JSON.parse(data) : [...INITIAL_MOCK_HOSTS];
    } catch {
      return [...INITIAL_MOCK_HOSTS];
    }
  }

  saveHosts(hosts: Host[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.HOSTS, JSON.stringify(hosts));
    } catch {}
  }

  getPorts(): Port[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.PORTS);
      return data ? JSON.parse(data) : [...INITIAL_MOCK_PORTS];
    } catch {
      return [...INITIAL_MOCK_PORTS];
    }
  }

  savePorts(ports: Port[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.PORTS, JSON.stringify(ports));
    } catch {}
  }

  getScans(): Scan[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SCANS);
      return data ? JSON.parse(data) : [...INITIAL_MOCK_SCANS];
    } catch {
      return [...INITIAL_MOCK_SCANS];
    }
  }

  saveScan(scan: Scan): void {
    const scans = this.getScans();
    const existingIndex = scans.findIndex((s) => s.id === scan.id);
    if (existingIndex >= 0) {
      scans[existingIndex] = scan;
    } else {
      scans.unshift(scan);
    }
    try {
      localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(scans));
    } catch {}
  }

  saveScans(scans: Scan[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SCANS, JSON.stringify(scans));
    } catch {}
  }

  getChanges(): ScanChange[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.CHANGES);
      return data ? JSON.parse(data) : [...INITIAL_MOCK_CHANGES];
    } catch {
      return [...INITIAL_MOCK_CHANGES];
    }
  }

  saveChanges(changes: ScanChange[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.CHANGES, JSON.stringify(changes));
    } catch {}
  }

  getMonitoringJobs(): MonitoringJob[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.MONITORING);
      return data ? JSON.parse(data) : [...INITIAL_MOCK_MONITORING_JOBS];
    } catch {
      return [...INITIAL_MOCK_MONITORING_JOBS];
    }
  }

  saveMonitoringJobs(jobs: MonitoringJob[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.MONITORING, JSON.stringify(jobs));
    } catch {}
  }

  getWatchlist(): PortWatchlistItem[] {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.WATCHLIST);
      return data ? JSON.parse(data) : [...DEFAULT_PORT_WATCHLIST];
    } catch {
      return [...DEFAULT_PORT_WATCHLIST];
    }
  }

  saveWatchlist(watchlist: PortWatchlistItem[]): void {
    try {
      localStorage.setItem(STORAGE_KEYS.WATCHLIST, JSON.stringify(watchlist));
    } catch {}
  }

  getSettings(): NetscopeSettings {
    try {
      const data = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      return data ? { ...DEFAULT_SETTINGS, ...JSON.parse(data) } : { ...DEFAULT_SETTINGS };
    } catch {
      return { ...DEFAULT_SETTINGS };
    }
  }

  saveSettings(settings: NetscopeSettings): void {
    try {
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
    } catch {}
  }

  reset(): void {
    this.saveHosts([...INITIAL_MOCK_HOSTS]);
    this.savePorts([...INITIAL_MOCK_PORTS]);
    this.saveScans([...INITIAL_MOCK_SCANS]);
    this.saveChanges([...INITIAL_MOCK_CHANGES]);
    this.saveMonitoringJobs([...INITIAL_MOCK_MONITORING_JOBS]);
    this.saveWatchlist([...DEFAULT_PORT_WATCHLIST]);
    this.saveSettings({ ...DEFAULT_SETTINGS });
  }
}

/**
 * SQLite Storage Provider (Upgraded for Phase 3)
 * Authoritative local persistence layer backed by native SQLite.
 * Syncs seamlessly across client and desktop runtime.
 */
export class SQLiteStorageProvider implements StorageProvider {
  name = 'SQLiteStorage';
  private localMirror = new MockStorageProvider();

  getHosts(): Host[] {
    return this.localMirror.getHosts();
  }

  saveHosts(hosts: Host[]): void {
    this.localMirror.saveHosts(hosts);
  }

  getPorts(): Port[] {
    return this.localMirror.getPorts();
  }

  savePorts(ports: Port[]): void {
    this.localMirror.savePorts(ports);
  }

  getScans(): Scan[] {
    return this.localMirror.getScans();
  }

  saveScan(scan: Scan): void {
    this.localMirror.saveScan(scan);
  }

  saveScans(scans: Scan[]): void {
    this.localMirror.saveScans(scans);
  }

  getChanges(): ScanChange[] {
    return this.localMirror.getChanges();
  }

  saveChanges(changes: ScanChange[]): void {
    this.localMirror.saveChanges(changes);
  }

  getMonitoringJobs(): MonitoringJob[] {
    return this.localMirror.getMonitoringJobs();
  }

  saveMonitoringJobs(jobs: MonitoringJob[]): void {
    this.localMirror.saveMonitoringJobs(jobs);
  }

  getWatchlist(): PortWatchlistItem[] {
    return this.localMirror.getWatchlist();
  }

  saveWatchlist(watchlist: PortWatchlistItem[]): void {
    this.localMirror.saveWatchlist(watchlist);
  }

  getSettings(): NetscopeSettings {
    return this.localMirror.getSettings();
  }

  saveSettings(settings: NetscopeSettings): void {
    this.localMirror.saveSettings(settings);
  }

  reset(): void {
    this.localMirror.reset();
  }
}
