/**
 * NETSCOPE Unit Tests: Safe Nmap Profile & Argument Construction
 */

import { buildNmapArgs } from '../src/lib/nmap/profiles';

export function runProfileTests() {
  console.log('--- RUNNING NMAP ARGUMENT TESTS ---');

  // Test 1: Common services arguments
  const args1 = buildNmapArgs({
    target: '192.168.1.1',
    profileId: 'common-services',
    xmlOutputPath: '/tmp/test.xml',
  });

  console.assert(args1[0] === '-oX', 'Failed: XML output flag missing');
  console.assert(args1[1] === '/tmp/test.xml', 'Failed: XML output path incorrect');
  console.assert(args1[args1.length - 1] === '192.168.1.1', 'Failed: target must be final positional argument');
  console.assert(args1.includes('-sT'), 'Failed: -sT flag expected in common services');

  // Test 2: Custom ports profile
  const args2 = buildNmapArgs({
    target: '10.0.0.10',
    profileId: 'custom-authorized',
    xmlOutputPath: '/tmp/test2.xml',
    customPorts: [22, 80, 443],
  });

  console.assert(args2.includes('-p'), 'Failed: -p flag expected for custom ports');
  console.assert(args2.includes('22,80,443'), 'Failed: port string expected');
  console.assert(args2[args2.length - 1] === '10.0.0.10', 'Failed: target must be final argument');

  console.log('✓ Nmap profile argument construction tests passed.');
}
