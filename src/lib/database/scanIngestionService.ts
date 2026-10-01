/**
 * NETSCOPE Scan Ingestion Service
 * Converts raw scan execution results and parsed domain models into
 * atomic, immutable historical records inside the persistent SQLite database.
 */

import { Host, Port, Scan, ScanChange } from '../../types';
import { sqliteService, SQLiteService, IngestScanPayload } from './sqliteService';
import { detectScanChanges } from '../parser/changeDetector';

export interface IngestionOptions {
  scan: Scan;
  hosts: Host[];
  ports: Port[];
  executionMode?: 'mock' | 'native';
  xmlArtifactPath?: string;
  baselineHosts?: Host[];
  baselinePorts?: Port[];
}

export class ScanIngestionService {
  /**
   * Ingests a completed scan into SQLite atomically
   */
  public static persistScan(
    options: IngestionOptions,
    customService?: SQLiteService
  ): {
    scan: Scan;
    changes: ScanChange[];
  } {
    const db = customService || sqliteService;

    // 1. Fetch previous baseline if not explicitly supplied
    let baselineHosts = options.baselineHosts;
    let baselinePorts = options.baselinePorts;

    if (!baselineHosts || !baselinePorts) {
      // Find previous scan on the same target
      const recentScans = db.listScans({ target: options.scan.target, limit: 2 });
      if (recentScans.scans.length > 0) {
        const prevScanId = recentScans.scans[0].id;
        const prevDetails = db.getScanDetails(prevScanId);
        if (prevDetails) {
          baselineHosts = prevDetails.observedHosts;
          baselinePorts = prevDetails.observedPorts;
        }
      }
    }

    // 2. Calculate baseline drift
    const changes = detectScanChanges({
      scanId: options.scan.id,
      target: options.scan.target,
      baselineHosts: baselineHosts || [],
      baselinePorts: baselinePorts || [],
      currentHosts: options.hosts,
      currentPorts: options.ports,
      timestamp: options.scan.completedAt || new Date().toISOString(),
    });

    // 3. Atomically persist via SQLiteService transaction
    const payload: IngestScanPayload = {
      scan: {
        ...options.scan,
        hostsDiscovered: options.hosts.length,
        openPortsDiscovered: options.ports.filter((p) => p.state === 'open').length,
        changesDetected: changes.length,
      },
      hosts: options.hosts,
      ports: options.ports,
      changes,
      executionMode: options.executionMode || 'mock',
      xmlArtifactPath: options.xmlArtifactPath || options.scan.rawOutputPath,
    };

    const persistedScan = db.ingestScan(payload);

    return {
      scan: persistedScan,
      changes,
    };
  }
}
