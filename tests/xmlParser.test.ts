/**
 * NETSCOPE Unit Tests: Canonical Nmap XML Output Parser
 */

import { parseNmapXml } from '../src/lib/parser/nmapXmlParser';
import { SAMPLE_NMAP_XML_BASIC, SAMPLE_NMAP_XML_CHANGES } from '../src/lib/parser/sampleData';

export function runXmlParserTests() {
  console.log('--- RUNNING NMAP XML PARSER TESTS ---');

  // Test 1: Parse standard Nmap XML fixture
  const res1 = parseNmapXml(SAMPLE_NMAP_XML_BASIC);
  console.assert(res1.errors.length === 0, `Test 1 Failed: Expected 0 errors, got ${res1.errors.join(', ')}`);
  console.assert(res1.hosts.length === 3, `Test 1 Failed: Expected 3 hosts, got ${res1.hosts.length}`);

  const hostIps = res1.hosts.map((h) => h.ip);
  console.assert(hostIps.includes('192.168.1.1'), 'Test 1 Failed: Missing host 192.168.1.1');
  console.assert(hostIps.includes('192.168.1.20'), 'Test 1 Failed: Missing host 192.168.1.20');
  console.assert(hostIps.includes('192.168.1.50'), 'Test 1 Failed: Missing host 192.168.1.50');

  // Check gateway host details
  const gateway = res1.hosts.find((h) => h.ip === '192.168.1.1');
  console.assert(gateway?.hostname === 'gateway.local', 'Test 1 Failed: Gateway PTR hostname incorrect');
  console.assert(gateway?.vendor === 'Cisco Systems', 'Test 1 Failed: Gateway vendor incorrect');

  // Check open ports count
  console.assert(res1.ports.length === 7, `Test 1 Failed: Expected 7 open ports across 3 hosts, got ${res1.ports.length}`);

  // Check specific port metadata
  const sshPort = res1.ports.find((p) => p.hostIp === '192.168.1.50' && p.port === 22);
  console.assert(sshPort?.service === 'ssh', 'Test 1 Failed: Expected ssh service on port 22');
  console.assert(sshPort?.product === 'OpenSSH', 'Test 1 Failed: Expected OpenSSH product');
  console.assert(sshPort?.version === '8.9p1', 'Test 1 Failed: Expected 8.9p1 version');

  // Test 2: Parse changes XML fixture
  const res2 = parseNmapXml(SAMPLE_NMAP_XML_CHANGES);
  console.assert(res2.hosts.length === 3, `Test 2 Failed: Expected 3 hosts in changes fixture, got ${res2.hosts.length}`);
  const newHost = res2.hosts.find((h) => h.ip === '192.168.1.99');
  console.assert(newHost !== undefined, 'Test 2 Failed: Expected new host 192.168.1.99');
  console.assert(newHost?.vendor === 'Raspberry Pi Foundation', 'Test 2 Failed: Vendor mismatch for new host');

  // Test 3: Malformed XML handling (resilience - must not crash)
  const malformed1 = parseNmapXml('');
  console.assert(malformed1.errors.length > 0, 'Test 3 Failed: Empty XML should record error');
  console.assert(malformed1.hosts.length === 0, 'Test 3 Failed: Empty XML should yield 0 hosts');

  const malformed2 = parseNmapXml('This is random plain text, not XML');
  console.assert(malformed2.errors.length > 0, 'Test 3 Failed: Plain text should record error');

  const malformed3 = parseNmapXml('<incomplete><xml>');
  console.assert(malformed3.errors.length > 0, 'Test 3 Failed: Incomplete XML should record error');

  console.log('✓ Nmap XML parser tests passed.');
}
