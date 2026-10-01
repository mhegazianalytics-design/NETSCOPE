/**
 * NETSCOPE Unit Tests: Baseline Scan Comparison & Change Detection Engine
 */

import { detectScanChanges } from '../src/lib/parser/changeDetector';
import { Host, Port } from '../src/types';

export function runChangeDetectionTests() {
  console.log('--- RUNNING CHANGE DETECTION TESTS ---');

  const baselineHosts: Host[] = [
    {
      id: 'h1',
      ip: '192.168.1.20',
      hostname: 'app-01',
      status: 'up',
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-09-01T00:00:00Z',
      openPortsCount: 2,
    },
    {
      id: 'h2',
      ip: '192.168.1.50',
      hostname: 'db-01',
      status: 'up',
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-09-01T00:00:00Z',
      openPortsCount: 1,
    },
  ];

  const baselinePorts: Port[] = [
    {
      id: 'p1',
      hostId: 'h1',
      hostIp: '192.168.1.20',
      port: 80,
      protocol: 'tcp',
      state: 'open',
      service: 'http',
      product: 'Apache httpd',
      version: '2.4.52',
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-09-01T00:00:00Z',
    },
    {
      id: 'p2',
      hostId: 'h1',
      hostIp: '192.168.1.20',
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: 'https',
      product: 'Apache httpd',
      version: '2.4.52',
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-09-01T00:00:00Z',
    },
    {
      id: 'p3',
      hostId: 'h2',
      hostIp: '192.168.1.50',
      port: 5432,
      protocol: 'tcp',
      state: 'open',
      service: 'postgresql',
      product: 'PostgreSQL DB',
      version: '15.0',
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-09-01T00:00:00Z',
    },
  ];

  // Current scan:
  // - 192.168.1.20: Port 22 is OPENED, Port 80 is CLOSED, Port 443 has version upgrade (2.4.54)
  // - 192.168.1.50 is REMOVED / unreachable
  // - 192.168.1.99 is a NEW HOST with port 8080 open
  const currentHosts: Host[] = [
    {
      id: 'h1',
      ip: '192.168.1.20',
      hostname: 'app-01',
      status: 'up',
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-10-01T00:00:00Z',
      openPortsCount: 2,
    },
    {
      id: 'h3',
      ip: '192.168.1.99',
      hostname: 'iot-device',
      status: 'up',
      firstSeen: '2026-10-01T00:00:00Z',
      lastSeen: '2026-10-01T00:00:00Z',
      openPortsCount: 1,
    },
  ];

  const currentPorts: Port[] = [
    {
      id: 'p4',
      hostId: 'h1',
      hostIp: '192.168.1.20',
      port: 22,
      protocol: 'tcp',
      state: 'open',
      service: 'ssh',
      product: 'OpenSSH',
      version: '9.0p1',
      firstSeen: '2026-10-01T00:00:00Z',
      lastSeen: '2026-10-01T00:00:00Z',
    },
    {
      id: 'p2',
      hostId: 'h1',
      hostIp: '192.168.1.20',
      port: 443,
      protocol: 'tcp',
      state: 'open',
      service: 'https',
      product: 'Apache httpd',
      version: '2.4.54', // Version changed from 2.4.52
      firstSeen: '2026-09-01T00:00:00Z',
      lastSeen: '2026-10-01T00:00:00Z',
    },
    {
      id: 'p5',
      hostId: 'h3',
      hostIp: '192.168.1.99',
      port: 8080,
      protocol: 'tcp',
      state: 'open',
      service: 'http-proxy',
      product: 'Node.js',
      version: '18.0',
      firstSeen: '2026-10-01T00:00:00Z',
      lastSeen: '2026-10-01T00:00:00Z',
    },
  ];

  const changes = detectScanChanges({
    scanId: 'test-scan-1',
    target: '192.168.1.0/24',
    baselineHosts,
    baselinePorts,
    currentHosts,
    currentPorts,
  });

  const changeTypes = changes.map((c) => c.changeType);

  console.assert(changeTypes.includes('NEW_HOST'), 'Failed: NEW_HOST (192.168.1.99) not detected');
  console.assert(changeTypes.includes('REMOVED_HOST'), 'Failed: REMOVED_HOST (192.168.1.50) not detected');
  console.assert(changeTypes.includes('PORT_OPENED'), 'Failed: PORT_OPENED (22/tcp) not detected');
  console.assert(changeTypes.includes('PORT_CLOSED'), 'Failed: PORT_CLOSED (80/tcp) not detected');
  console.assert(changeTypes.includes('VERSION_CHANGED'), 'Failed: VERSION_CHANGED (443/tcp) not detected');

  console.log(`✓ Change detection tests passed. (${changes.length} events correctly identified)`);
}
