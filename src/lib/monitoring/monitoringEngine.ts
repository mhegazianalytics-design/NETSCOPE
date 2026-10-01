/**
 * NETSCOPE Monitoring Engine
 * Local-first continuous network assessment engine with deterministic scheduling,
 * duplicate execution prevention, concurrency limits, and event generation.
 * Strictly executes predefined authorized reconnaissance profiles.
 */

import {
  MonitoringEngineStatus,
  MonitoringEvent,
  MonitoringEventType,
  MonitoringEventSeverity,
  MonitoringJob,
  MonitoringJobRuntimeState,
  ScanChange,
} from '../../types';
import { sqliteService, SQLiteService } from '../database/sqliteService';
import { ScanIngestionService } from '../database/scanIngestionService';
import { validateTarget } from '../validation/targetValidator';
import { detectNmap, getNativeScanStatus, startNativeScan, stopNativeScan } from '../nmap/nativeService';
import { parseNmapXml } from '../parser/nmapXmlParser';
import { SAMPLE_NMAP_XML_BASIC, SAMPLE_NMAP_XML_CHANGES } from '../parser/sampleData';

export interface MonitoringEngineOptions {
  dbService?: SQLiteService;
  maxConcurrency?: number;
  tickIntervalMs?: number;
  mockMode?: boolean;
}

interface RunningScanInfo {
  jobId: string;
  scanId: string;
  startedAt: string;
  isMock: boolean;
  cancelRequested?: boolean;
}

export class MonitoringEngine {
  private db: SQLiteService;
  private maxConcurrency: number;
  private tickIntervalMs: number;
  private mockMode: boolean;

  private isRunning: boolean = false;
  private schedulerTimer: NodeJS.Timeout | null = null;
  private isTicking: boolean = false;

  private runningScans: Map<string, RunningScanInfo> = new Map(); // jobId -> RunningScanInfo
  private queuedJobs: string[] = []; // array of jobIds
  private jobRetries: Map<string, number> = new Map(); // jobId -> current retry count
  private lastTickAt: string = '';

  constructor(options?: MonitoringEngineOptions) {
    this.db = options?.dbService || sqliteService;
    this.maxConcurrency = options?.maxConcurrency || 2;
    this.tickIntervalMs = options?.tickIntervalMs || 1000;
    this.mockMode = options?.mockMode ?? true;
  }

  /**
   * Initializes the engine and loads persisted jobs.
   * Requirement 14: Restores previously active jobs as PAUSED on startup
   * to ensure no unexpected scans run until operator explicitly resumes.
   */
  public start(): void {
    if (this.isRunning) return;
    this.isRunning = true;

    // Load persisted jobs and restore runtime states safely
    const jobs = this.db.getMonitoringJobs();
    for (const job of jobs) {
      if (job.status === 'active') {
        // Enforce safe startup: active jobs are put in paused state on server start
        this.db.updateMonitoringJobRuntime(job.id, {
          status: 'paused',
          runtimeState: 'paused',
          lastError: 'Restored as paused on application startup. Operator explicit resume required.',
        });
      } else {
        this.db.updateMonitoringJobRuntime(job.id, {
          runtimeState: job.status as MonitoringJobRuntimeState,
        });
      }
    }

    // Start centralized scheduler loop
    this.schedulerTimer = setInterval(() => {
      this.tick().catch((err) => {
        console.error('[NETSCOPE MonitoringEngine] Uncaught error in scheduler tick:', err);
      });
    }, this.tickIntervalMs);

    console.log('[NETSCOPE MonitoringEngine] Continuous monitoring engine started.');
  }

  /**
   * Graceful shutdown of scheduler and active scans.
   */
  public async stop(): Promise<void> {
    if (!this.isRunning) return;
    this.isRunning = false;

    if (this.schedulerTimer) {
      clearInterval(this.schedulerTimer);
      this.schedulerTimer = null;
    }

    // Stop active scans safely through existing cancellation logic
    for (const [jobId, running] of this.runningScans.entries()) {
      running.cancelRequested = true;
      if (!running.isMock) {
        await stopNativeScan(running.scanId);
      }
      this.db.updateMonitoringJobRuntime(jobId, {
        runtimeState: 'stopped',
        status: 'stopped',
      });
    }

    this.runningScans.clear();
    this.queuedJobs = [];
    this.jobRetries.clear();

    console.log('[NETSCOPE MonitoringEngine] Continuous monitoring engine stopped cleanly.');
  }

  public getStatus(): MonitoringEngineStatus {
    const jobs = this.db.getMonitoringJobs();
    const activeJobs = jobs.filter((j) => j.status === 'active').length;

    return {
      running: this.isRunning,
      activeJobsCount: activeJobs,
      runningScansCount: this.runningScans.size,
      queuedScansCount: this.queuedJobs.length,
      maxConcurrency: this.maxConcurrency,
      lastTickAt: this.lastTickAt,
    };
  }

  public setMockMode(mock: boolean): void {
    this.mockMode = mock;
  }

  public setMaxConcurrency(max: number): void {
    this.maxConcurrency = Math.max(1, max);
  }

  /**
   * Central Scheduler Tick
   * Evaluates due jobs, enforces duplicate execution protection,
   * checks concurrency limits, and launches jobs.
   */
  public async tick(): Promise<void> {
    if (!this.isRunning || this.isTicking) return;
    this.isTicking = true;
    this.lastTickAt = new Date().toISOString();

    try {
      // 1. Process queued jobs first if concurrency allows
      while (this.queuedJobs.length > 0 && this.runningScans.size < this.maxConcurrency) {
        const nextJobId = this.queuedJobs.shift()!;
        const job = this.db.getMonitoringJobs().find((j) => j.id === nextJobId);
        if (job && job.status === 'active' && !this.runningScans.has(job.id)) {
          this.executeJob(job).catch((err) => {
            console.error(`[NETSCOPE MonitoringEngine] Error executing queued job ${job.id}:`, err);
          });
        }
      }

      // 2. Evaluate active jobs from database
      const now = Date.now();
      const allJobs = this.db.getMonitoringJobs();
      const activeJobs = allJobs.filter((j) => j.status === 'active');

      for (const job of activeJobs) {
        // Prevent duplicate execution: if already running or queued, do nothing
        if (this.runningScans.has(job.id) || this.queuedJobs.includes(job.id)) {
          continue;
        }

        // Check if next_run_at is due
        const nextRunTime = job.nextRunAt ? new Date(job.nextRunAt).getTime() : 0;
        const isDue = nextRunTime <= now;

        if (isDue) {
          // Check concurrency limit
          if (this.runningScans.size >= this.maxConcurrency) {
            // Queue job
            this.queuedJobs.push(job.id);
            this.db.updateMonitoringJobRuntime(job.id, { runtimeState: 'queued' });
          } else {
            // Launch immediately
            this.executeJob(job).catch((err) => {
              console.error(`[NETSCOPE MonitoringEngine] Error executing job ${job.id}:`, err);
            });
          }
        }
      }
    } finally {
      this.isTicking = false;
    }
  }

  /**
   * Executes a scheduled monitoring job scan through the existing pipeline.
   */
  public async executeJob(job: MonitoringJob): Promise<void> {
    // Duplicate execution guard
    if (this.runningScans.has(job.id)) {
      return;
    }

    // Requirement 8: Target boundary validation before launch
    const validation = validateTarget(job.target);
    if (!validation.isValid || !validation.normalizedTarget) {
      const errorMsg = validation.error || `Target validation failed for ${job.target}`;
      console.error(`[NETSCOPE MonitoringEngine] Target boundary check failed for job ${job.id}: ${errorMsg}`);

      this.db.updateMonitoringJobRuntime(job.id, {
        status: 'stopped',
        runtimeState: 'failed',
        lastError: errorMsg,
        failureCount: (job.failureCount || 0) + 1,
        lastFailureAt: new Date().toISOString(),
      });

      this.createEvent({
        monitoringJobId: job.id,
        scanId: 'none',
        eventType: 'SCAN_FAILED',
        severity: 'warning',
        hostIp: job.target,
        description: `Validation rejected target boundary: ${errorMsg}`,
      });
      return;
    }

    const scanId = `mon-scan-${Date.now()}-${job.id.slice(-4)}`;
    const startedAt = new Date().toISOString();
    const isMock = this.mockMode;

    const runningRecord: RunningScanInfo = {
      jobId: job.id,
      scanId,
      startedAt,
      isMock,
    };
    this.runningScans.set(job.id, runningRecord);

    this.db.updateMonitoringJobRuntime(job.id, {
      runtimeState: 'running',
      currentScanId: scanId,
    });

    try {
      let xmlContent = '';
      let xmlArtifactPath = `data/scans/${scanId}/result.xml`;

      if (isMock) {
        // Execute through Mock Pipeline using sample fixtures
        xmlContent = job.totalRuns > 0 ? SAMPLE_NMAP_XML_CHANGES : SAMPLE_NMAP_XML_BASIC;
      } else {
        // Real Native Nmap Execution using existing nativeService
        const settings = this.db.getSettings();
        const nmapStatus = await detectNmap(settings?.nmapPath);
        if (!nmapStatus.installed || !nmapStatus.path) {
          throw new Error(`Nmap binary not found at ${nmapStatus.path || 'configured path'}`);
        }

        const launchRes = await startNativeScan(nmapStatus.path, {
          target: validation.normalizedTarget,
          profile: job.profileId,
          customPorts: job.watchPorts && job.watchPorts.length > 0 ? job.watchPorts : undefined,
          timeout: job.scanTimeoutSeconds || 120,
        });

        if (launchRes.error || !launchRes.scanId) {
          throw new Error(launchRes.error || 'Failed to start native Nmap process.');
        }

        // Poll for scan completion
        const actualScanId = launchRes.scanId;
        runningRecord.scanId = actualScanId;

        const scanResult = await new Promise<{ xmlContent: string; xmlPath: string }>((resolve, reject) => {
          const pollTimer = setInterval(async () => {
            if (runningRecord.cancelRequested) {
              clearInterval(pollTimer);
              await stopNativeScan(actualScanId);
              reject(new Error('Scan stopped by operator.'));
              return;
            }

            const status = await getNativeScanStatus(actualScanId);
            if (!status) return;

            if (status.status === 'completed') {
              clearInterval(pollTimer);
              resolve({ xmlContent: status.xmlContent || '', xmlPath: status.xmlPath || xmlArtifactPath });
            } else if (status.status === 'failed' || status.status === 'timeout' || status.status === 'stopped') {
              clearInterval(pollTimer);
              reject(new Error(status.error || `Process reached ${status.status}`));
            }
          }, 1000);
        });

        xmlContent = scanResult.xmlContent;
        xmlArtifactPath = scanResult.xmlPath;
      }

      // Check if cancellation or pause was requested during execution
      if (runningRecord.cancelRequested) {
        throw new Error('Scan cancelled by operator.');
      }

      // Existing XML Parser
      const parsed = parseNmapXml(xmlContent);
      const completedAt = new Date().toISOString();
      const durationSeconds = Math.max(
        1,
        Math.floor((new Date(completedAt).getTime() - new Date(startedAt).getTime()) / 1000)
      );

      const candidateScan = {
        id: scanId,
        target: validation.normalizedTarget,
        profileId: job.profileId,
        profileName: `Monitoring: ${job.name}`,
        startedAt,
        completedAt,
        durationSeconds,
        status: 'completed' as const,
        hostsDiscovered: parsed.hosts.length,
        openPortsDiscovered: parsed.ports.filter((p) => p.state === 'open').length,
        changesDetected: 0,
        rawOutputPath: xmlArtifactPath,
      };

      // Ingest atomically into SQLite via existing ScanIngestionService
      const ingested = ScanIngestionService.persistScan(
        {
          scan: candidateScan,
          hosts: parsed.hosts,
          ports: parsed.ports,
          executionMode: isMock ? 'mock' : 'native',
          xmlArtifactPath,
        },
        this.db
      );

      // Generate Monitoring Events for detected changes
      this.generateEventsForChanges(job, ingested.scan.id, ingested.changes);

      // Reset retry count on success
      this.jobRetries.delete(job.id);

      // Refresh job state from DB to check if operator requested PAUSE while scan was running
      const currentJobState = this.db.getMonitoringJobs().find((j) => j.id === job.id);
      const isPausing = currentJobState?.runtimeState === 'pausing';

      const nextRunsCount = (currentJobState?.totalRuns || job.totalRuns || 0) + 1;
      const nextChangesCount = (currentJobState?.detectedChangesCount || job.detectedChangesCount || 0) + ingested.changes.length;

      if (isPausing || currentJobState?.status === 'paused') {
        // Requirement 12: Scan finished, result persisted, now becomes PAUSED
        this.db.updateMonitoringJobRuntime(job.id, {
          status: 'paused',
          runtimeState: 'paused',
          lastRunAt: completedAt,
          totalRuns: nextRunsCount,
          detectedChangesCount: nextChangesCount,
          currentScanId: undefined,
          lastError: undefined,
        });
      } else if (currentJobState?.status === 'active') {
        const nextRunAt = new Date(Date.now() + job.intervalSeconds * 1000).toISOString();
        this.db.updateMonitoringJobRuntime(job.id, {
          runtimeState: 'idle',
          lastRunAt: completedAt,
          nextRunAt,
          totalRuns: nextRunsCount,
          detectedChangesCount: nextChangesCount,
          currentScanId: undefined,
          lastError: undefined,
        });
      }
    } catch (err: any) {
      console.error(`[NETSCOPE MonitoringEngine] Scan failed for job ${job.id}:`, err.stack || err.message);
      this.handleScanFailure(job, err.message);
    } finally {
      this.runningScans.delete(job.id);
    }
  }

  /**
   * Requirement 10: Conservative failure handling and retry policy.
   * Maximum 2 retries per cycle. If exhausted, records failure and reschedules.
   */
  private handleScanFailure(job: MonitoringJob, errorMessage: string): void {
    const currentRetries = this.jobRetries.get(job.id) || 0;

    if (currentRetries < 2) {
      // Schedule quick retry in 5 seconds
      const nextRetryCount = currentRetries + 1;
      this.jobRetries.set(job.id, nextRetryCount);

      const retryTime = new Date(Date.now() + 5000).toISOString();
      this.db.updateMonitoringJobRuntime(job.id, {
        runtimeState: 'queued',
        nextRunAt: retryTime,
        lastError: `Scan attempt ${nextRetryCount} failed: ${errorMessage}. Retrying...`,
        currentScanId: undefined,
      });
      console.log(`[NETSCOPE MonitoringEngine] Job ${job.id} failed, retry ${nextRetryCount}/2 scheduled in 5s.`);
    } else {
      // Retries exhausted: record failure, emit event, and schedule next normal execution
      this.jobRetries.delete(job.id);
      const nextRunAt = new Date(Date.now() + job.intervalSeconds * 1000).toISOString();

      this.db.updateMonitoringJobRuntime(job.id, {
        runtimeState: 'failed',
        failureCount: (job.failureCount || 0) + 1,
        lastError: errorMessage,
        lastFailureAt: new Date().toISOString(),
        nextRunAt,
        currentScanId: undefined,
      });

      this.createEvent({
        monitoringJobId: job.id,
        scanId: 'none',
        eventType: 'SCAN_FAILED',
        severity: 'warning',
        hostIp: job.target,
        description: `Monitoring sweep failed: ${errorMessage}`,
      });
    }
  }

  /**
   * Requirement 16 & 23: Translates scan deltas into typed monitoring events.
   * Severity values limited strictly to: 'info', 'notice', 'warning'.
   */
  private generateEventsForChanges(job: MonitoringJob, scanId: string, changes: ScanChange[]): void {
    const watchlist = this.db.getWatchlist();
    const watchedPorts = new Set(watchlist.filter((w) => w.enabled).map((w) => w.port));

    for (const c of changes) {
      let eventType: MonitoringEventType = 'PORT_OPENED';
      let severity: MonitoringEventSeverity = 'notice';
      let desc = '';

      switch (c.changeType) {
        case 'PORT_OPENED':
          eventType = 'PORT_OPENED';
          // Watchlisted port gets elevated to 'warning'
          severity = c.port && watchedPorts.has(c.port) ? 'warning' : 'notice';
          desc = `Port ${c.port}/${c.protocol || 'tcp'} opened on ${c.hostIp} (${c.currentValue})`;
          break;

        case 'PORT_CLOSED':
          eventType = 'PORT_CLOSED';
          severity = 'info';
          desc = `Port ${c.port}/${c.protocol || 'tcp'} closed on ${c.hostIp}`;
          break;

        case 'NEW_HOST':
          eventType = 'NEW_HOST';
          severity = 'notice';
          desc = `New active host discovered: ${c.hostIp} (${c.currentValue})`;
          break;

        case 'REMOVED_HOST':
          eventType = 'REMOVED_HOST';
          severity = 'info';
          desc = `Host became unreachable: ${c.hostIp}`;
          break;

        case 'SERVICE_CHANGED':
          eventType = 'SERVICE_CHANGED';
          severity = 'notice';
          desc = `Service changed on ${c.hostIp}:${c.port} (${c.previousValue || 'unknown'} → ${c.currentValue})`;
          break;

        case 'VERSION_CHANGED':
          eventType = 'VERSION_CHANGED';
          severity = 'info';
          desc = `Version update detected on ${c.hostIp}:${c.port} (${c.previousValue || 'unknown'} → ${c.currentValue})`;
          break;
      }

      this.createEvent({
        monitoringJobId: job.id,
        scanId,
        eventType,
        severity,
        hostIp: c.hostIp,
        port: c.port,
        protocol: c.protocol,
        description: desc,
      });
    }
  }

  private createEvent(data: {
    monitoringJobId: string;
    scanId: string;
    eventType: MonitoringEventType;
    severity: MonitoringEventSeverity;
    hostIp: string;
    port?: number;
    protocol?: 'tcp' | 'udp';
    description: string;
  }): MonitoringEvent {
    const event: MonitoringEvent = {
      id: `evt-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      monitoringJobId: data.monitoringJobId,
      scanId: data.scanId,
      eventType: data.eventType,
      severity: data.severity,
      hostIp: data.hostIp,
      port: data.port,
      protocol: data.protocol || 'tcp',
      description: data.description,
      createdAt: new Date().toISOString(),
    };

    return this.db.createMonitoringEvent(event);
  }

  // --- JOB CONTROLS ---

  public createJob(jobData: {
    name?: string;
    target: string;
    profileId: any;
    intervalSeconds: number;
    scanTimeoutSeconds?: number;
    watchPorts?: number[];
  }): MonitoringJob {
    const val = validateTarget(jobData.target);
    if (!val.isValid || !val.normalizedTarget) {
      throw new Error(val.error || 'Invalid target format.');
    }

    const interval = Math.max(15, jobData.intervalSeconds || 60); // Conservative min interval: 15s
    const now = new Date().toISOString();
    const nextRunAt = new Date(Date.now() + interval * 1000).toISOString();

    const job: MonitoringJob = {
      id: `job-${Date.now()}`,
      name: jobData.name?.trim() || `Sweep ${val.normalizedTarget}`,
      target: val.normalizedTarget,
      profileId: jobData.profileId || 'common-services',
      intervalSeconds: interval,
      scanTimeoutSeconds: jobData.scanTimeoutSeconds || 120,
      watchPorts: jobData.watchPorts || [],
      status: 'active',
      runtimeState: 'idle',
      totalRuns: 0,
      detectedChangesCount: 0,
      failureCount: 0,
      nextRunAt,
      createdAt: now,
    };

    return this.db.upsertMonitoringJob(job);
  }

  /**
   * Requirement 12: Pause behavior
   * If scan is running, transitions to 'pausing' and finishes before pausing.
   * If idle/queued, immediately pauses.
   */
  public pauseJob(id: string): boolean {
    const job = this.db.getMonitoringJobs().find((j) => j.id === id);
    if (!job) return false;

    // Remove from queued list if queued
    this.queuedJobs = this.queuedJobs.filter((jId) => jId !== id);

    if (this.runningScans.has(id)) {
      // Mark as pausing: current scan finishes, persists, then becomes paused
      this.db.updateMonitoringJobRuntime(id, {
        runtimeState: 'pausing',
      });
    } else {
      this.db.updateMonitoringJobRuntime(id, {
        status: 'paused',
        runtimeState: 'paused',
      });
    }
    return true;
  }

  /**
   * Resumes a paused/stopped job.
   */
  public resumeJob(id: string): boolean {
    const job = this.db.getMonitoringJobs().find((j) => j.id === id);
    if (!job) return false;

    // Immediately schedule next execution
    const nextRunAt = new Date().toISOString();
    this.db.updateMonitoringJobRuntime(id, {
      status: 'active',
      runtimeState: 'idle',
      nextRunAt,
      lastError: undefined,
    });
    return true;
  }

  /**
   * Requirement 13: Stop behavior
   * Disables future scheduling, requests cancellation if running, marks STOPPED.
   */
  public async stopJob(id: string): Promise<boolean> {
    const job = this.db.getMonitoringJobs().find((j) => j.id === id);
    if (!job) return false;

    this.queuedJobs = this.queuedJobs.filter((jId) => jId !== id);

    const running = this.runningScans.get(id);
    if (running) {
      running.cancelRequested = true;
      if (!running.isMock) {
        await stopNativeScan(running.scanId);
      }
      this.runningScans.delete(id);
    }

    this.db.updateMonitoringJobRuntime(id, {
      status: 'stopped',
      runtimeState: 'stopped',
      currentScanId: undefined,
    });
    return true;
  }

  public async deleteJob(id: string): Promise<boolean> {
    await this.stopJob(id);
    return this.db.deleteMonitoringJob(id);
  }

  public acknowledgeEvent(eventId: string): boolean {
    return this.db.acknowledgeMonitoringEvent(eventId);
  }

  public acknowledgeAllEvents(): number {
    return this.db.acknowledgeAllMonitoringEvents();
  }

  public listEvents(options?: { jobId?: string; unacknowledgedOnly?: boolean; limit?: number }): MonitoringEvent[] {
    return this.db.listMonitoringEvents(options);
  }
}

export const monitoringEngine = new MonitoringEngine();
