/**
 * NETSCOPE Normalized Domain Data Models
 * Strict TypeScript types for local network reconnaissance & continuous assessment
 */

export type ScanStatus = 'idle' | 'running' | 'completed' | 'failed' | 'cancelled';

export type ChangeType =
  | 'NEW_HOST'
  | 'REMOVED_HOST'
  | 'PORT_OPENED'
  | 'PORT_CLOSED'
  | 'SERVICE_CHANGED'
  | 'VERSION_CHANGED';

export type SeverityLevel = 'info' | 'low' | 'medium' | 'high';

export interface Host {
  id: string;
  ip: string;
  hostname?: string;
  mac?: string;
  vendor?: string;
  status: 'up' | 'down';
  osMatch?: string;
  osAccuracy?: number;
  firstSeen: string;
  lastSeen: string;
  openPortsCount: number;
}

export interface Port {
  id: string;
  hostId: string;
  hostIp: string;
  port: number;
  protocol: 'tcp' | 'udp';
  state: 'open' | 'closed' | 'filtered';
  service: string;
  product?: string;
  version?: string;
  extraInfo?: string;
  firstSeen: string;
  lastSeen: string;
}

export interface Service {
  id: string;
  name: string;
  protocol: 'tcp' | 'udp';
  port: number;
  product?: string;
  version?: string;
  hostCount: number;
}

export type ScanProfileId =
  | 'host-discovery'
  | 'common-services'
  | 'service-detection'
  | 'custom-authorized';

export interface ScanProfile {
  id: ScanProfileId;
  name: string;
  description: string;
  nmapArgs: string[];
  safeForProduction: boolean;
  estimatedDuration: string;
}

export interface Scan {
  id: string;
  target: string;
  profileId: ScanProfileId;
  profileName: string;
  startedAt: string;
  completedAt?: string;
  durationSeconds?: number;
  status: ScanStatus;
  hostsDiscovered: number;
  openPortsDiscovered: number;
  changesDetected: number;
  rawOutputPath?: string;
  errorMessage?: string;
}

export interface ScanResult {
  scanId: string;
  scan: Scan;
  hosts: Host[];
  ports: Port[];
  changes: ScanChange[];
}

export interface ScanChange {
  id: string;
  scanId: string;
  target: string;
  hostIp: string;
  port?: number;
  protocol?: 'tcp' | 'udp';
  changeType: ChangeType;
  previousValue?: string;
  currentValue: string;
  severity: SeverityLevel;
  timestamp: string;
}

export type MonitoringJobRuntimeState =
  | 'idle'
  | 'queued'
  | 'running'
  | 'pausing'
  | 'paused'
  | 'stopped'
  | 'failed';

export interface MonitoringJob {
  id: string;
  name: string;
  target: string;
  profileId: ScanProfileId;
  intervalSeconds: number;
  scanTimeoutSeconds?: number;
  watchPorts: number[];
  status: 'active' | 'paused' | 'stopped';
  runtimeState?: MonitoringJobRuntimeState;
  lastRunAt?: string;
  nextRunAt?: string;
  totalRuns: number;
  detectedChangesCount: number;
  failureCount?: number;
  lastError?: string;
  lastFailureAt?: string;
  currentScanId?: string;
  currentScanStartedAt?: string;
  createdAt: string;
}

export type MonitoringEventType =
  | 'NEW_HOST'
  | 'REMOVED_HOST'
  | 'PORT_OPENED'
  | 'PORT_CLOSED'
  | 'SERVICE_CHANGED'
  | 'VERSION_CHANGED'
  | 'SCAN_FAILED';

export type MonitoringEventSeverity = 'info' | 'notice' | 'warning';

export interface MonitoringEvent {
  id: string;
  monitoringJobId: string;
  scanId: string;
  eventType: MonitoringEventType;
  severity: MonitoringEventSeverity;
  hostId?: string;
  hostIp: string;
  port?: number;
  protocol?: 'tcp' | 'udp';
  description: string;
  createdAt: string;
  acknowledgedAt?: string;
}

export interface MonitoringEngineStatus {
  running: boolean;
  activeJobsCount: number;
  runningScansCount: number;
  queuedScansCount: number;
  maxConcurrency: number;
  lastTickAt: string;
}

export interface PortWatchlistItem {
  id: string;
  port: number;
  protocol: 'tcp' | 'udp';
  serviceName: string;
  description: string;
  enabled: boolean;
  riskNote: string;
}

export interface NetscopeSettings {
  nmapPath: string;
  databasePath: string;
  mockMode: boolean;
  defaultScanProfile: ScanProfileId;
  defaultMonitoringInterval: number; // in seconds
  aiProvider: 'gemini' | 'deepseek';
  geminiApiKeyConfigured: boolean;
  deepseekApiKeyConfigured: boolean;
  allowedSubnets: string[];
  maxScanConcurrency: number;
  telemetryDisabled: boolean;
}

export interface AIAnalysisFinding {
  title: string;
  category: 'Observed' | 'Potential concern' | 'Needs verification';
  severity: 'informational' | 'low' | 'medium' | 'high';
  affectedHost: string;
  affectedPort?: number;
  evidence: string;
  configurationQuestions: string[];
  recommendedValidationSteps: string[];
  confidence: number; // 0 to 1
}

export interface AIAnalysisReport {
  scanId: string;
  target: string;
  generatedAt: string;
  provider: 'gemini' | 'deepseek';
  executiveSummary: string;
  observedServicesSummary: string;
  findings: AIAnalysisFinding[];
}
