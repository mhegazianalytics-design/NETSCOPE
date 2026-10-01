/**
 * NETSCOPE Integration Test: Section 29 Data Integrity Test
 * Verifies that two successive scans against the same target preserve immutable
 * historical observations while tracking baseline changes accurately.
 */

import { SQLiteService } from '../src/lib/database/sqliteService';
import { ScanIngestionService } from '../src/lib/database/scanIngestionService';
import { Host, Port, Scan } from '../src/types';
import fs from 'fs';
import path from 'path';

export function runDataIntegrityTest() {
  console.log('--- RUNNING SECTION 29 DATA INTEGRITY TEST ---');

  const testDbPath = path.resolve(process.cwd(), 'data', 'test-integrity.db');
  if (fs.existsSync(testDbPath)) {
    fs.unlinkSync(testDbPath);
  }

  const service = new SQLiteService(testDbPath);
  service.initialize();
  // Clear any seeded sample scans for clean test scope
  (service as any).db.exec('DELETE FROM scans; DELETE FROM scan_hosts; DELETE FROM scan_ports; DELETE FROM scan_changes; DELETE FROM ports; DELETE FROM hosts;');

  const hostIdentity: Host = {
    id: 'host-192-168-1-10',
    ip: '192.168.1.10',
    hostname: 'test-node.lan',
    status: 'up',
    firstSeen: '2026-10-01T12:00:00Z',
    lastSeen: '2026-10-01T12:00:00Z',
    openPortsCount: 2,
  };

  // --- SCAN #1 ---
  // 192.168.1.10: 80 open, 443 open
  const scan1: Scan = {
    id: 'scan-integrity-001',
    target: '192.168.1.10',
    profileId: 'common-services',
    profileName: 'Common Services',
    startedAt: '2026-10-01T12:00:00Z',
    completedAt: '2026-10-01T12:01:00Z',
    durationSeconds: 60,
    status: 'completed',
    hostsDiscovered: 1,
    openPortsDiscovered: 2,
    changesDetected: 0,
  };

  const portsScan1: Port[] = [
    {
      id: 'port-10-80-tcp',
      hostId: hostIdentity.id,
      hostIp: hostIdentity.ip,
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: 'http',
      product: 'Apache',
      firstSeen: '2026-10-01T12:00:00Z',
      lastSeen: '2026-10-01T12:00:00Z',
    },
    {
      id: 'port-10-443-tcp',
      hostId: hostIdentity.id,
      hostIp: hostIdentity.ip,
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: 'https',
      product: 'Apache',
      firstSeen: '2026-10-01T12:00:00Z',
      lastSeen: '2026-10-01T12:00:00Z',
    },
  ];

  // Ingest Scan #1
  const res1 = (service as any).ingestScan({
    scan: scan1,
    hosts: [hostIdentity],
    ports: portsScan1,
    changes: [],
    executionMode: 'mock',
  });

  console.assert(res1.id === 'scan-integrity-001', 'Integrity Test: Scan #1 ingestion failed');

  // --- SCAN #2 ---
  // 192.168.1.10: 22 open, 443 open (80 closed)
  const scan2: Scan = {
    id: 'scan-integrity-002',
    target: '192.168.1.10',
    profileId: 'common-services',
    profileName: 'Common Services',
    startedAt: '2026-10-01T13:00:00Z',
    completedAt: '2026-10-01T13:01:00Z',
    durationSeconds: 60,
    status: 'completed',
    hostsDiscovered: 1,
    openPortsDiscovered: 2,
    changesDetected: 0,
  };

  const portsScan2: Port[] = [
    {
      id: 'port-10-22-tcp',
      hostId: hostIdentity.id,
      hostIp: hostIdentity.ip,
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: 'ssh',
      product: 'OpenSSH',
      firstSeen: '2026-10-01T13:00:00Z',
      lastSeen: '2026-10-01T13:00:00Z',
    },
    {
      id: 'port-10-443-tcp',
      hostId: hostIdentity.id,
      hostIp: hostIdentity.ip,
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: 'https',
      product: 'Apache',
      firstSeen: '2026-10-01T12:00:00Z',
      lastSeen: '2026-10-01T13:00:00Z',
    },
  ];

  // Ingest Scan #2 via ScanIngestionService with Scan #1 as baseline
  const res2 = ScanIngestionService.persistScan(
    {
      scan: scan2,
      hosts: [{ ...hostIdentity, lastSeen: '2026-10-01T13:00:00Z' }],
      ports: portsScan2,
      baselineHosts: [hostIdentity],
      baselinePorts: portsScan1,
      executionMode: 'mock',
    },
    service
  );

  // --- VERIFY DATA INTEGRITY REQUIREMENTS ---

  // 1. Scan #1 and Scan #2 are both preserved
  const scan1Details = service.getScanDetails('scan-integrity-001');
  const scan2Details = service.getScanDetails('scan-integrity-002');

  console.assert(scan1Details !== null, 'Integrity Test: Scan #1 must be preserved in database');
  console.assert(scan2Details !== null, 'Integrity Test: Scan #2 must be preserved in database');

  // 2. Historical Scan #1 must still show: 80 open, 443 open
  const scan1PortNumbers = scan1Details!.observedPorts.map((p) => p.port).sort((a, b) => a - b);
  console.assert(
    scan1PortNumbers.length === 2 && scan1PortNumbers[0] === 80 && scan1PortNumbers[1] === 443,
    `Integrity Test Failed: Historical Scan #1 must show ports 80 and 443, got ${scan1PortNumbers.join(', ')}`
  );

  // 3. Historical Scan #2 must show: 22 open, 443 open
  const scan2PortNumbers = scan2Details!.observedPorts.map((p) => p.port).sort((a, b) => a - b);
  console.assert(
    scan2PortNumbers.length === 2 && scan2PortNumbers[0] === 22 && scan2PortNumbers[1] === 443,
    `Integrity Test Failed: Historical Scan #2 must show ports 22 and 443, got ${scan2PortNumbers.join(', ')}`
  );

  // 4. Change history must record: PORT_OPENED 22 and PORT_CLOSED 80
  const changes = scan2Details!.changes;
  const changeTypes = changes.map((c) => `${c.changeType} ${c.port}`);

  console.assert(
    changeTypes.includes('PORT_OPENED 22'),
    `Integrity Test Failed: Expected PORT_OPENED 22 in changes, got ${changeTypes.join(', ')}`
  );
  console.assert(
    changeTypes.includes('PORT_CLOSED 80'),
    `Integrity Test Failed: Expected PORT_CLOSED 80 in changes, got ${changeTypes.join(', ')}`
  );

  // Clean up test DB
  service.close();
  try {
    fs.unlinkSync(testDbPath);
  } catch {}

  console.log('✓ Section 29 Data Integrity Test PASSED (Historical scans remain immutable).');
}
