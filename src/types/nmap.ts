import { ScanProfileId } from './index';

export interface NmapStatus {
  installed: boolean;
  path: string;
  version?: string;
  error?: string;
}

export interface ScanRequest {
  target: string;
  profile: ScanProfileId;
  watchlist?: number[];
  timeout?: number; // in seconds
  customPorts?: number[];
}

export type ScanProcessState =
  | 'idle'
  | 'initializing'
  | 'running'
  | 'parsing'
  | 'completed'
  | 'failed'
  | 'stopped'
  | 'timeout';

export interface ScanExecutionResult {
  scanId: string;
  status: ScanProcessState;
  startedAt: string;
  completedAt?: string;
  xmlPath?: string;
  xmlContent?: string;
  error?: string;
  elapsedSeconds?: number;
}
