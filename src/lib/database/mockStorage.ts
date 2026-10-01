/**
 * NETSCOPE Central State & Storage Manager
 * Dispatches scan execution and synchronizes local UI state with the authoritative
 * persistent SQLite database via the desktop bridge.
 */

import {
  Host,
  MonitoringEngineStatus,
  MonitoringEvent,
  MonitoringJob,
  NetscopeSettings,
  Port,
  PortWatchlistItem,
  Scan,
  ScanChange,
  ScanProfileId,
} from '../../types';
import { ScanProcessState } from '../../types/nmap';
import { SCAN_PROFILES } from '../nmap/profiles';
import { DEFAULT_PORT_WATCHLIST } from '../nmap/watchlist';
import { parseNmapXml } from '../parser/nmapXmlParser';
import { desktopBridge } from '../../desktop/bridge';
import {
  INITIAL_MOCK_CHANGES,
  INITIAL_MOCK_HOSTS,
  INITIAL_MOCK_MONITORING_JOBS,
  INITIAL_MOCK_PORTS,
  INITIAL_MOCK_SCANS,
} from '../parser/sampleData';

const DEFAULT_SETTINGS: NetscopeSettings = {
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

type Listener = () => void;

class MockDatabase {
  private hosts: Host[] = [...INITIAL_MOCK_HOSTS];
  private ports: Port[] = [...INITIAL_MOCK_PORTS];
  private scans: Scan[] = [...INITIAL_MOCK_SCANS];
  private changes: ScanChange[] = [...INITIAL_MOCK_CHANGES];
  private monitoringJobs: MonitoringJob[] = [...INITIAL_MOCK_MONITORING_JOBS];
  private monitoringEvents: MonitoringEvent[] = [];
  private engineStatus: MonitoringEngineStatus | null = null;
  private watchlist: PortWatchlistItem[] = [...DEFAULT_PORT_WATCHLIST];
  private settings: NetscopeSettings = DEFAULT_SETTINGS;
  private listeners: Set<Listener> = new Set();
  private activeScanId: string | null = null;
  private activeScanCancelRequested = false;

  constructor() {
    this.loadLocalCache();
    // Synchronize with persistent SQLite backend
    if (typeof window !== 'undefined') {
      setTimeout(() => this.syncFromSQLite(), 100);
      // Auto-poll monitoring engine state and new scans every 4 seconds
      setInterval(() => this.syncFromSQLite(), 4000);
    }
  }

  private loadLocalCache() {
    try {
      const stored = localStorage.getItem('netscope_settings');
      if (stored) {
        this.settings = { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      }
    } catch {}
  }

  public async syncFromSQLite(): Promise<void> {
    try {
      const [scansRes, hostsRes, portsRes, changesRes, jobsRes, watchRes, eventsRes, engineRes] =
        await Promise.all([
          desktopBridge.fetchScans({ limit: 100 }),
          desktopBridge.fetchHosts(),
          desktopBridge.fetchPorts(),
          desktopBridge.fetchChanges(),
          desktopBridge.fetchMonitoringJobs(),
          desktopBridge.fetchWatchlist(),
          desktopBridge.fetchMonitoringEvents({ limit: 50 }),
          desktopBridge.fetchMonitoringEngineStatus(),
        ]);

      if (scansRes.scans.length > 0) this.scans = scansRes.scans;
      if (hostsRes.length > 0) this.hosts = hostsRes;
      if (portsRes.length > 0) this.ports = portsRes;
      if (changesRes.length > 0) this.changes = changesRes;
      if (jobsRes.length > 0) this.monitoringJobs = jobsRes;
      if (watchRes.length > 0) this.watchlist = watchRes;
      this.monitoringEvents = eventsRes;
      this.engineStatus = engineRes;

      this.notify();
    } catch {
      // In standalone web preview or offline, local in-memory fallback remains active
    }
  }

  public subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private notify() {
    this.listeners.forEach((fn) => fn());
  }

  // Getters
  public getHosts(): Host[] {
    return [...this.hosts];
  }

  public getPorts(): Port[] {
    return [...this.ports];
  }

  public getScans(): Scan[] {
    return [...this.scans];
  }

  public getChanges(): ScanChange[] {
    return [...this.changes];
  }

  public getMonitoringJobs(): MonitoringJob[] {
    return [...this.monitoringJobs];
  }

  public getMonitoringEvents(): MonitoringEvent[] {
    return [...this.monitoringEvents];
  }

  public getEngineStatus(): MonitoringEngineStatus | null {
    return this.engineStatus;
  }

  public getWatchlist(): PortWatchlistItem[] {
    return [...this.watchlist];
  }

  public getSettings(): NetscopeSettings {
    return { ...this.settings };
  }

  // Actions
  public updateSettings(newSettings: Partial<NetscopeSettings>) {
    this.settings = { ...this.settings, ...newSettings };
    try {
      localStorage.setItem('netscope_settings', JSON.stringify(this.settings));
    } catch {}
    this.notify();
  }

  public async toggleWatchlistPort(id: string) {
    const item = this.watchlist.find((w) => w.id === id);
    if (!item) return;

    const updated = { ...item, enabled: !item.enabled };
    this.watchlist = this.watchlist.map((w) => (w.id === id ? updated : w));
    this.notify();
    await desktopBridge.saveWatchlistItem(updated);
  }

  public async addWatchlistPort(item: Omit<PortWatchlistItem, 'id'>) {
    const newItem: PortWatchlistItem = {
      ...item,
      id: `port-custom-${Date.now()}-${item.port}`,
    };
    this.watchlist.push(newItem);
    this.notify();
    await desktopBridge.saveWatchlistItem(newItem);
  }

  public removeWatchlistPort(id: string) {
    this.watchlist = this.watchlist.filter((item) => item.id !== id);
    this.notify();
  }

  public async createMonitoringJob(
    job: Omit<MonitoringJob, 'id' | 'createdAt' | 'totalRuns' | 'detectedChangesCount'>
  ) {
    const newJob: MonitoringJob = {
      ...job,
      id: `job-${Date.now()}`,
      createdAt: new Date().toISOString(),
      totalRuns: 0,
      detectedChangesCount: 0,
      runtimeState: 'idle',
      nextRunAt: new Date(Date.now() + job.intervalSeconds * 1000).toISOString(),
    };
    this.monitoringJobs.unshift(newJob);
    this.notify();
    await desktopBridge.saveMonitoringJob(newJob);
    await this.syncFromSQLite();
    return newJob;
  }

  public async pauseMonitoringJob(id: string) {
    this.monitoringJobs = this.monitoringJobs.map((j) =>
      j.id === id ? { ...j, status: 'paused', runtimeState: 'paused' } : j
    );
    this.notify();
    await desktopBridge.pauseMonitoringJob(id);
    await this.syncFromSQLite();
  }

  public async resumeMonitoringJob(id: string) {
    this.monitoringJobs = this.monitoringJobs.map((j) =>
      j.id === id ? { ...j, status: 'active', runtimeState: 'idle' } : j
    );
    this.notify();
    await desktopBridge.resumeMonitoringJob(id);
    await this.syncFromSQLite();
  }

  public async stopMonitoringJob(id: string) {
    this.monitoringJobs = this.monitoringJobs.map((j) =>
      j.id === id ? { ...j, status: 'stopped', runtimeState: 'stopped' } : j
    );
    this.notify();
    await desktopBridge.stopMonitoringJob(id);
    await this.syncFromSQLite();
  }

  public async updateMonitoringJobStatus(id: string, status: 'active' | 'paused' | 'stopped') {
    if (status === 'paused') {
      await this.pauseMonitoringJob(id);
    } else if (status === 'active') {
      await this.resumeMonitoringJob(id);
    } else {
      await this.stopMonitoringJob(id);
    }
  }

  public async deleteMonitoringJob(id: string) {
    this.monitoringJobs = this.monitoringJobs.filter((j) => j.id !== id);
    this.notify();
    await desktopBridge.deleteMonitoringJob(id);
  }

  public async acknowledgeEvent(id: string) {
    const now = new Date().toISOString();
    this.monitoringEvents = this.monitoringEvents.map((e) =>
      e.id === id ? { ...e, acknowledgedAt: now } : e
    );
    this.notify();
    await desktopBridge.acknowledgeMonitoringEvent(id);
  }

  public async acknowledgeAllEvents() {
    const now = new Date().toISOString();
    this.monitoringEvents = this.monitoringEvents.map((e) => ({
      ...e,
      acknowledgedAt: e.acknowledgedAt || now,
    }));
    this.notify();
    await desktopBridge.acknowledgeAllMonitoringEvents();
  }

  /**
   * Stops an active scan in either real or mock mode
   */
  public async stopActiveScan(scanId: string): Promise<boolean> {
    this.activeScanCancelRequested = true;
    if (!this.settings.mockMode) {
      await desktopBridge.stopScan(scanId);
    }

    this.scans = this.scans.map((s) => {
      if (s.id === scanId) {
        return {
          ...s,
          status: 'cancelled',
          completedAt: new Date().toISOString(),
          errorMessage: 'Scan stopped by operator',
        };
      }
      return s;
    });

    this.notify();
    this.activeScanId = null;
    return true;
  }

  /**
   * Unified Scan Execution (Real Native Nmap or Mock Mode)
   * Converges both execution models at the atomic SQLite database ingestion layer.
   */
  public async executeScan(options: {
    target: string;
    profileId: ScanProfileId;
    selectedPorts?: number[];
    timeoutSeconds?: number;
    onProgress?: (message: string, percent?: number) => void;
    onStateChange?: (state: ScanProcessState) => void;
  }): Promise<Scan> {
    const profile = SCAN_PROFILES[options.profileId] || SCAN_PROFILES['common-services'];
    const startedAt = new Date().toISOString();
    this.activeScanCancelRequested = false;

    // --- MODE 1: MOCK SCANNER ---
    if (this.settings.mockMode) {
      const scanId = `mock-scan-${Date.now()}`;
      this.activeScanId = scanId;

      const scanRecord: Scan = {
        id: scanId,
        target: options.target,
        profileId: options.profileId,
        profileName: profile.name,
        startedAt,
        status: 'running',
        hostsDiscovered: 0,
        openPortsDiscovered: 0,
        changesDetected: 0,
        rawOutputPath: `data/scans/${scanId}/result.xml`,
      };

      this.scans.unshift(scanRecord);
      this.notify();
      options.onStateChange?.('running');

      const mockResult = await desktopBridge.executeMockScan(
        {
          target: options.target,
          profile: options.profileId,
          customPorts: options.selectedPorts,
        },
        (msg, pct) => {
          options.onProgress?.(msg, pct);
          if (msg.includes('Initializing')) options.onStateChange?.('initializing');
          if (msg.includes('Running')) options.onStateChange?.('running');
          if (msg.includes('Parsing')) options.onStateChange?.('parsing');
        }
      );

      if (this.activeScanCancelRequested) {
        throw new Error('Scan stopped by operator.');
      }

      // Canonical XML Parsing using the real XML parser
      options.onStateChange?.('parsing');
      const parsed = parseNmapXml(mockResult.xmlContent);

      const completedAt = new Date().toISOString();
      const durationSeconds = Math.max(
        1,
        Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      );

      const candidateScan: Scan = {
        ...scanRecord,
        completedAt,
        durationSeconds,
        status: 'completed',
        hostsDiscovered: parsed.hosts.length,
        openPortsDiscovered: parsed.ports.filter((p) => p.state === 'open').length,
        changesDetected: 0,
      };

      // Ingest atomically into SQLite
      const ingested = await desktopBridge.ingestScanToDb({
        scan: candidateScan,
        hosts: parsed.hosts,
        ports: parsed.ports,
        executionMode: 'mock',
        xmlArtifactPath: candidateScan.rawOutputPath,
      });

      // Synchronize updated state from SQLite
      await this.syncFromSQLite();

      options.onStateChange?.('completed');
      options.onProgress?.('Scan completed successfully and committed to SQLite.', 100);
      this.activeScanId = null;
      return ingested.scan;
    }

    // --- MODE 2: REAL NATIVE NMAP EXECUTION ---
    options.onStateChange?.('initializing');
    options.onProgress?.('Initializing Nmap process and verifying executable...');

    const launchRes = await desktopBridge.startScan(
      {
        target: options.target,
        profile: options.profileId,
        customPorts: options.selectedPorts,
        timeout: options.timeoutSeconds || 120,
      },
      this.settings.nmapPath
    );

    if (launchRes.error || !launchRes.scanId) {
      options.onStateChange?.('failed');
      throw new Error(launchRes.error || 'Failed to start native Nmap process.');
    }

    const scanId = launchRes.scanId;
    this.activeScanId = scanId;

    const initialScan: Scan = {
      id: scanId,
      target: options.target,
      profileId: options.profileId,
      profileName: profile.name,
      startedAt,
      status: 'running',
      hostsDiscovered: 0,
      openPortsDiscovered: 0,
      changesDetected: 0,
      rawOutputPath: `data/scans/${scanId}/result.xml`,
    };

    this.scans.unshift(initialScan);
    this.notify();

    options.onStateChange?.('running');
    options.onProgress?.(`Nmap running (PID isolated). Probing target ${options.target}...`);

    return new Promise((resolve, reject) => {
      const pollInterval = setInterval(async () => {
        if (this.activeScanCancelRequested) {
          clearInterval(pollInterval);
          reject(new Error('Scan stopped by operator.'));
          return;
        }

        const statusRes = await desktopBridge.getScanStatus(scanId);
        if (!statusRes) return;

        if (statusRes.status === 'running') {
          options.onProgress?.(
            `Nmap running (${statusRes.elapsedSeconds || 0}s elapsed)...`
          );
        } else if (
          statusRes.status === 'completed' ||
          statusRes.status === 'failed' ||
          statusRes.status === 'stopped' ||
          statusRes.status === 'timeout'
        ) {
          clearInterval(pollInterval);
          this.activeScanId = null;

          if (statusRes.status === 'failed' || statusRes.status === 'timeout') {
            options.onStateChange?.(statusRes.status);
            const failedScan: Scan = {
              ...initialScan,
              completedAt: statusRes.completedAt || new Date().toISOString(),
              status: 'failed',
              errorMessage: statusRes.error || `Process ${statusRes.status}`,
            };
            this.scans = this.scans.map((s) => (s.id === scanId ? failedScan : s));
            this.notify();
            reject(new Error(failedScan.errorMessage));
            return;
          }

          if (statusRes.status === 'stopped') {
            options.onStateChange?.('stopped');
            const stoppedScan: Scan = {
              ...initialScan,
              completedAt: statusRes.completedAt || new Date().toISOString(),
              status: 'cancelled',
              errorMessage: 'Scan stopped by operator',
            };
            this.scans = this.scans.map((s) => (s.id === scanId ? stoppedScan : s));
            this.notify();
            resolve(stoppedScan);
            return;
          }

          // Parse captured Nmap XML artifact
          options.onStateChange?.('parsing');
          options.onProgress?.('Parsing real Nmap XML output and persisting to SQLite...');

          const xml = statusRes.xmlContent || '';
          const parsed = parseNmapXml(xml);

          const completedAt = statusRes.completedAt || new Date().toISOString();
          const durationSeconds = Math.max(
            1,
            Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
          );

          const completedCandidate: Scan = {
            ...initialScan,
            completedAt,
            durationSeconds,
            status: 'completed',
            hostsDiscovered: parsed.hosts.length,
            openPortsDiscovered: parsed.ports.filter((p) => p.state === 'open').length,
            changesDetected: 0,
          };

          const ingested = await desktopBridge.ingestScanToDb({
            scan: completedCandidate,
            hosts: parsed.hosts,
            ports: parsed.ports,
            executionMode: 'native',
            xmlArtifactPath: statusRes.xmlPath,
          });

          await this.syncFromSQLite();

          options.onStateChange?.('completed');
          options.onProgress?.('Scan completed successfully and committed to SQLite.', 100);
          resolve(ingested.scan);
        }
      }, 1000);
    });
  }

  public async resetToFactoryMock(): Promise<void> {
    await desktopBridge.resetDatabase();
    await this.syncFromSQLite();
  }
}

export const db = new MockDatabase();
