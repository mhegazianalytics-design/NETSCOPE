/**
 * NETSCOPE Unit Tests: Target & Input Validation
 */

import { validateTarget, validatePortList, isRfc1918OrLoopback } from '../src/lib/validation/targetValidator';

export function runValidationTests() {
  console.log('--- RUNNING VALIDATION TESTS ---');

  // Test 1: Valid IPv4
  const res1 = validateTarget('192.168.1.1');
  console.assert(res1.isValid === true, 'Test 1 Failed: 192.168.1.1 should be valid');
  console.assert(res1.type === 'ipv4', 'Test 1 Failed: type should be ipv4');
  console.assert(res1.isPrivateNetwork === true, 'Test 1 Failed: 192.168.1.1 is private');

  // Test 2: Valid CIDR
  const res2 = validateTarget('10.0.0.0/24');
  console.assert(res2.isValid === true, 'Test 2 Failed: 10.0.0.0/24 should be valid CIDR');
  console.assert(res2.type === 'ipv4_cidr', 'Test 2 Failed: type should be ipv4_cidr');

  // Test 3: Command Injection Prevention
  const dangerousInputs = [
    '192.168.1.1; rm -rf /',
    '192.168.1.1 && whoami',
    '192.168.1.1 | cat /etc/passwd',
    '192.168.1.1`id`',
    '192.168.1.1$(id)',
    '192.168.1.1 > out.txt',
    '192.168.1.1 < in.txt',
    '192.168.1.1\nwhoami',
  ];

  for (const input of dangerousInputs) {
    const res = validateTarget(input);
    console.assert(res.isValid === false, `Test 3 Failed: Dangerous input should be rejected: ${input}`);
  }

  // Test 4: Oversized CIDR range rejection (/8 or /0)
  const res4 = validateTarget('10.0.0.0/8');
  console.assert(res4.isValid === false, 'Test 4 Failed: /8 CIDR should be rejected as too broad');

  // Test 5: Valid Hostname
  const res5 = validateTarget('gateway.internal');
  console.assert(res5.isValid === true, 'Test 5 Failed: gateway.internal should be valid hostname');

  // Test 6: Port validation
  const portRes1 = validatePortList('22,80,443,8080');
  console.assert(portRes1.isValid === true, 'Test 6 Failed: valid ports string');
  console.assert(portRes1.ports.length === 4, 'Test 6 Failed: should parse 4 ports');

  const portRes2 = validatePortList('22,99999');
  console.assert(portRes2.isValid === false, 'Test 6 Failed: 99999 should be rejected');

  console.log('✓ Validation tests passed.');
}
