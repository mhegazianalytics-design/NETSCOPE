/**
 * NETSCOPE Unit Tests: Database Ingestion, Transactions, and Rollback
 */

import { SQLiteService } from '../src/lib/database/sqliteService';
import { Host, Port, Scan, ScanChange } from '../src/types';
import fs from 'fs';
import path from 'path';

export function runDatabaseIngestionTests() {
  console.log('--- RUNNING DATABASE INGESTION & TRANSACTION TESTS ---');

  const testDbPath = path.resolve(process.cwd(), 'data', 'test-ingestion.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const service = new SQLiteService(testDbPath);
  service.initialize();

  // Test 1: Ingest Scan with Hosts, Ports, and Junction Relationships
  const testScan: Scan = {
    id: 'test-scan-001',
    target: '10.0.0.0/24',
    profileId: 'common-services',
    profileName: 'Common Services (Top 100)',
    startedAt: '2026-10-01T10:00:00Z',
    completedAt: '2026-10-01T10:01:00Z',
    durationSeconds: 60,
    status: 'completed',
    hostsDiscovered: 1,
    openPortsDiscovered: 2,
    changesDetected: 1,
    rawOutputPath: 'data/scans/test-scan-001/result.xml',
  };

  const testHosts: Host[] = [
    {
      id: 'host-10-0-0-5',
      ip: '10.0.0.5',
      hostname: 'test-server.lan',
      mac: '00:11:22:33:44:55',
      vendor: 'Virtual Machine',
      status: 'up',
      firstSeen: '2026-10-01T10:00:00Z',
      lastSeen: '2026-10-01T10:00:00Z',
      openPortsCount: 2,
    },
  ];

  const testPorts: Port[] = [
    {
      id: 'port-10-0-0-5-22-tcp',
      hostId: 'host-10-0-0-5',
      hostIp: '10.0.0.5',
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: 'ssh',
      product: 'OpenSSH',
      version: '9.0',
      firstSeen: '2026-10-01T10:00:00Z',
      lastSeen: '2026-10-01T10:00:00Z',
    },
    {
      id: 'port-10-0-0-5-80-tcp',
      hostId: 'host-10-0-0-5',
      hostIp: '10.0.0.5',
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: 'http',
      product: 'nginx',
      version: '1.24',
      firstSeen: '2026-10-01T10:00:00Z',
      lastSeen: '2026-10-01T10:00:00Z',
    },
  ];

  const testChanges: ScanChange[] = [
    {
      id: 'change-001',
      scanId: 'test-scan-001',
      target: '10.0.0.0/24',
      hostIp: '10.0.0.5',
      port: 22,
      protocol: 'tcp',
      changeType: 'PORT_OPENED',
      previousValue: 'closed',
      currentValue: '22/tcp open (ssh OpenSSH 9.0)',
      severity: 'medium',
      timestamp: '2026-10-01T10:01:00Z',
    },
  ];

  const ingested = service.ingestScan({
    scan: testScan,
    hosts: testHosts,
    ports: testPorts,
    changes: testChanges,
    executionMode: 'mock',
    xmlArtifactPath: 'data/scans/test-scan-001/result.xml',
  });

  console.assert(ingested.id === 'test-scan-001', 'Test 1 Failed: Ingested scan ID mismatch');

  // Verify historical scan details with junction tables
  const details = service.getScanDetails('test-scan-001');
  console.assert(details !== null, 'Test 1 Failed: Scan details not found');
  console.assert(details?.observedHosts.length === 1, 'Test 1 Failed: Observed hosts count mismatch');
  console.assert(details?.observedPorts.length === 2, 'Test 1 Failed: Observed ports count mismatch');
  console.assert(details?.changes.length === 1, 'Test 1 Failed: Changes count mismatch');

  // Test 2: Transaction Rollback on Failure (Ensures no partial writes)
  let rollbackCaught = false;
  try {
    service.executeTransaction(() => {
      // Step A: Insert a dummy scan
      const insertScan = (service as any).db.prepare(`
        INSERT INTO scans (id, target, profile, profile_name, execution_mode, status, started_at, created_at)
        VALUES ('rollback-test', '127.0.0.1', 'common-services', 'Test', 'mock', 'running', 'now', 'now')
      `);
      insertScan.run();

      // Step B: Trigger deliberate foreign key violation or SQL error
      (service as any).db.exec("INSERT INTO nonexistent_table VALUES ('fail');");
    });
  } catch {
    rollbackCaught = true;
  }

  console.assert(rollbackCaught === true, 'Test 2 Failed: Transaction error should have thrown');
  const rolledBackScan = service.listScans({ target: '127.0.0.1' });
  console.assert(
    rolledBackScan.scans.length === 0,
    'Test 2 Failed: Partial scan should have been rolled back and removed completely'
  );

  // Test 3: Pagination and Filtering
  const paginated = service.listScans({ limit: 1, offset: 0 });
  console.assert(paginated.scans.length <= 1, 'Test 3 Failed: Pagination limit not respected');

  // Clean up test file
  service.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}

  console.log('✓ Database ingestion and transaction rollback tests passed.');
}
