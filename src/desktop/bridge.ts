/**
 * NETSCOPE Desktop Bridge
 * Controlled native execution layer for Nmap reconnaissance operations
 * and persistent local SQLite database queries.
 * Strictly avoids exposing arbitrary shell or SQL execution APIs.
 */

import { NmapStatus, ScanExecutionResult, ScanRequest } from '../types/nmap';
import {
  Host,
  MonitoringEngineStatus,
  MonitoringEvent,
  MonitoringJob,
  Port,
  PortWatchlistItem,
  Scan,
  ScanChange,
} from '../types';
import { SAMPLE_NMAP_XML_BASIC, SAMPLE_NMAP_XML_CHANGES } from '../lib/parser/sampleData';

export interface DatabaseStatus {
  connected: boolean;
  engine: string;
  path: string;
  schemaVersion?: number;
  tablesCount: number;
}

export interface DesktopBridge {
  isDesktopRuntime: () => boolean;
  getNmapStatus: (configuredPath?: string) => Promise<NmapStatus>;
  getDatabaseStatus: () => Promise<DatabaseStatus>;
  startScan: (request: ScanRequest, configuredNmapPath?: string) => Promise<{ scanId: string; error?: string }>;
  stopScan: (scanId: string) => Promise<{ success: boolean; error?: string }>;
  getScanStatus: (scanId: string) => Promise<ScanExecutionResult | null>;
  executeMockScan: (
    request: ScanRequest,
    onStatusUpdate?: (status: string, percent?: number) => void
  ) => Promise<{ xmlContent: string; scanId: string }>;

  // Database operations
  ingestScanToDb: (payload: {
    scan: Scan;
    hosts: Host[];
    ports: Port[];
    changes?: ScanChange[];
    executionMode?: 'mock' | 'native';
    xmlArtifactPath?: string;
  }) => Promise<{ scan: Scan; changes: ScanChange[] }>;

  fetchScans: (options?: { search?: string; status?: string; target?: string; limit?: number; offset?: number }) => Promise<{ scans: Scan[]; total: number }>;
  fetchScanDetails: (id: string) => Promise<{ scan: Scan; observedHosts: Host[]; observedPorts: Port[]; changes: ScanChange[] } | null>;
  fetchHosts: () => Promise<Host[]>;
  fetchHostDetails: (id: string) => Promise<{ host: Host; ports: Port[]; scans: { scanId: string; target: string; observedAt: string }[]; changes: ScanChange[] } | null>;
  fetchPorts: () => Promise<Port[]>;
  fetchChanges: (scanId?: string) => Promise<ScanChange[]>;
  fetchMonitoringJobs: () => Promise<MonitoringJob[]>;
  saveMonitoringJob: (job: MonitoringJob) => Promise<MonitoringJob>;
  deleteMonitoringJob: (id: string) => Promise<boolean>;
  pauseMonitoringJob: (id: string) => Promise<boolean>;
  resumeMonitoringJob: (id: string) => Promise<boolean>;
  stopMonitoringJob: (id: string) => Promise<boolean>;
  fetchMonitoringEngineStatus: () => Promise<MonitoringEngineStatus>;
  fetchMonitoringEvents: (options?: { jobId?: string; unacknowledgedOnly?: boolean; limit?: number }) => Promise<MonitoringEvent[]>;
  acknowledgeMonitoringEvent: (id: string) => Promise<boolean>;
  acknowledgeAllMonitoringEvents: () => Promise<{ success: boolean; count: number }>;
  fetchWatchlist: () => Promise<PortWatchlistItem[]>;
  saveWatchlistItem: (item: PortWatchlistItem) => Promise<PortWatchlistItem>;
  resetDatabase: () => Promise<boolean>;
}

export const desktopBridge: DesktopBridge = {
  isDesktopRuntime: () => {
    return (
      typeof window !== 'undefined' &&
      ('__TAURI__' in window || '__NETSCOPE_DESKTOP__' in window)
    );
  },

  getNmapStatus: async (configuredPath?: string): Promise<NmapStatus> => {
    // 1. If running under native Tauri shell
    if (desktopBridge.isDesktopRuntime() && (window as any).__TAURI__) {
      try {
        const res = await (window as any).__TAURI__.invoke('get_nmap_status', {
          configuredPath,
        });
        return res as NmapStatus;
      } catch (err: any) {
        return {
          installed: false,
          path: configuredPath || 'nmap',
          error: err?.message || 'Tauri command failed',
        };
      }
    }

    // 2. Query local desktop server API (/api/nmap/status)
    try {
      const url = configuredPath
        ? `/api/nmap/status?path=${encodeURIComponent(configuredPath)}`
        : '/api/nmap/status';
      const response = await fetch(url);
      if (response.ok) {
        const data = await response.json();
        return data as NmapStatus;
      }
    } catch {
      // Backend unreachable
    }

    return {
      installed: false,
      path: configuredPath || 'C:\\Program Files\\Nmap\\nmap.exe',
      error: 'Nmap native runner unavailable. Use Mock Mode in Settings.',
    };
  },

  getDatabaseStatus: async (): Promise<DatabaseStatus> => {
    try {
      const res = await fetch('/api/db/status');
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    return {
      connected: true,
      engine: 'SQLite (Native DatabaseSync)',
      path: '~/.netscope/netscope.db',
      schemaVersion: 2,
      tablesCount: 10,
    };
  },

  startScan: async (
    request: ScanRequest,
    configuredNmapPath?: string
  ): Promise<{ scanId: string; error?: string }> => {
    if (desktopBridge.isDesktopRuntime() && (window as any).__TAURI__) {
      try {
        return await (window as any).__TAURI__.invoke('start_authorized_scan', {
          request,
          configuredNmapPath,
        });
      } catch (err: any) {
        return { scanId: '', error: err?.message || 'Failed to start scan via Tauri.' };
      }
    }

    try {
      const response = await fetch('/api/nmap/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          request,
          nmapPath: configuredNmapPath,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        return { scanId: '', error: data.error || 'Server rejected scan request.' };
      }
      return data;
    } catch (err: any) {
      return { scanId: '', error: `Native scan launch failed: ${err.message}` };
    }
  },

  stopScan: async (scanId: string): Promise<{ success: boolean; error?: string }> => {
    if (desktopBridge.isDesktopRuntime() && (window as any).__TAURI__) {
      try {
        return await (window as any).__TAURI__.invoke('stop_scan', { scanId });
      } catch (err: any) {
        return { success: false, error: err?.message };
      }
    }

    try {
      const response = await fetch('/api/nmap/stop', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ scanId }),
      });
      return await response.json();
    } catch (err: any) {
      return { success: false, error: err.message };
    }
  },

  getScanStatus: async (scanId: string): Promise<ScanExecutionResult | null> => {
    if (desktopBridge.isDesktopRuntime() && (window as any).__TAURI__) {
      try {
        return await (window as any).__TAURI__.invoke('get_scan_status', { scanId });
      } catch {
        return null;
      }
    }

    try {
      const response = await fetch(`/api/nmap/scan/${scanId}`);
      if (response.ok) {
        return await response.json();
      }
    } catch {}

    return null;
  },

  executeMockScan: async (
    request: ScanRequest,
    onStatusUpdate?: (status: string, percent?: number) => void
  ): Promise<{ xmlContent: string; scanId: string }> => {
    const scanId = `mock-scan-${Date.now()}`;

    onStatusUpdate?.('Initializing Nmap (Mock Mode)...');
    await new Promise((r) => setTimeout(r, 300));

    onStatusUpdate?.('Running safe host discovery & port probes...');
    await new Promise((r) => setTimeout(r, 400));

    onStatusUpdate?.('Capturing Nmap XML output buffer...');
    await new Promise((r) => setTimeout(r, 300));

    onStatusUpdate?.('Parsing XML and recording baseline deviations...');
    await new Promise((r) => setTimeout(r, 200));

    const xmlContent =
      request.profile === 'service-detection'
        ? SAMPLE_NMAP_XML_CHANGES
        : SAMPLE_NMAP_XML_BASIC;

    onStatusUpdate?.('Completed', 100);
    return { xmlContent, scanId };
  },

  ingestScanToDb: async (payload) => {
    try {
      const res = await fetch('/api/db/scan/ingest', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}

    return {
      scan: payload.scan,
      changes: payload.changes || [],
    };
  },

  fetchScans: async (options) => {
    try {
      const query = new URLSearchParams();
      if (options?.search) query.set('search', options.search);
      if (options?.status) query.set('status', options.status);
      if (options?.target) query.set('target', options.target);
      if (options?.limit) query.set('limit', options.limit.toString());
      if (options?.offset) query.set('offset', options.offset.toString());

      const res = await fetch(`/api/db/scans?${query.toString()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return { scans: [], total: 0 };
  },

  fetchScanDetails: async (id: string) => {
    try {
      const res = await fetch(`/api/db/scans/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return null;
  },

  fetchHosts: async () => {
    try {
      const res = await fetch('/api/db/hosts');
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  fetchHostDetails: async (id: string) => {
    try {
      const res = await fetch(`/api/db/hosts/${id}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return null;
  },

  fetchPorts: async () => {
    try {
      const res = await fetch('/api/db/ports');
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  fetchChanges: async (scanId?: string) => {
    try {
      const url = scanId ? `/api/db/changes?scanId=${scanId}` : '/api/db/changes';
      const res = await fetch(url);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  fetchMonitoringJobs: async () => {
    try {
      const res = await fetch('/api/db/monitoring');
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  saveMonitoringJob: async (job: MonitoringJob) => {
    try {
      const res = await fetch('/api/db/monitoring', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(job),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return job;
  },

  deleteMonitoringJob: async (id: string) => {
    try {
      const res = await fetch(`/api/monitoring/jobs/${id}`, { method: 'DELETE' });
      return res.ok;
    } catch {}
    return false;
  },

  pauseMonitoringJob: async (id: string) => {
    try {
      const res = await fetch(`/api/monitoring/jobs/${id}/pause`, { method: 'POST' });
      return res.ok;
    } catch {}
    return false;
  },

  resumeMonitoringJob: async (id: string) => {
    try {
      const res = await fetch(`/api/monitoring/jobs/${id}/resume`, { method: 'POST' });
      return res.ok;
    } catch {}
    return false;
  },

  stopMonitoringJob: async (id: string) => {
    try {
      const res = await fetch(`/api/monitoring/jobs/${id}/stop`, { method: 'POST' });
      return res.ok;
    } catch {}
    return false;
  },

  fetchMonitoringEngineStatus: async () => {
    try {
      const res = await fetch('/api/monitoring/status');
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return {
      running: true,
      activeJobsCount: 0,
      runningScansCount: 0,
      queuedScansCount: 0,
      maxConcurrency: 2,
      lastTickAt: new Date().toISOString(),
    };
  },

  fetchMonitoringEvents: async (options) => {
    try {
      const query = new URLSearchParams();
      if (options?.jobId) query.set('jobId', options.jobId);
      if (options?.unacknowledgedOnly) query.set('unacknowledgedOnly', 'true');
      if (options?.limit) query.set('limit', options.limit.toString());

      const res = await fetch(`/api/monitoring/events?${query.toString()}`);
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  acknowledgeMonitoringEvent: async (id: string) => {
    try {
      const res = await fetch(`/api/monitoring/events/${id}/ack`, { method: 'POST' });
      return res.ok;
    } catch {}
    return false;
  },

  acknowledgeAllMonitoringEvents: async () => {
    try {
      const res = await fetch('/api/monitoring/events/ack-all', { method: 'POST' });
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return { success: false, count: 0 };
  },

  fetchWatchlist: async () => {
    try {
      const res = await fetch('/api/db/watchlist');
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return [];
  },

  saveWatchlistItem: async (item: PortWatchlistItem) => {
    try {
      const res = await fetch('/api/db/watchlist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(item),
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return item;
  },

  resetDatabase: async () => {
    try {
      const res = await fetch('/api/db/reset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: 'RESET_CONFIRM' }),
      });
      return res.ok;
    } catch {}
    return false;
  },
};
