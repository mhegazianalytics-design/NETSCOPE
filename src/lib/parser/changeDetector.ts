/**
 * NETSCOPE Change Detection Engine
 * Performs deterministic baseline comparison between two scan runs on the same target.
 */

import { ChangeType, Host, Port, ScanChange, SeverityLevel } from '../../types';

export function detectScanChanges(options: {
  scanId: string;
  target: string;
  baselineHosts: Host[];
  baselinePorts: Port[];
  currentHosts: Host[];
  currentPorts: Port[];
  timestamp?: string;
}): ScanChange[] {
  const {
    scanId,
    target,
    baselineHosts,
    baselinePorts,
    currentHosts,
    currentPorts,
    timestamp = new Date().toISOString(),
  } = options;

  const changes: ScanChange[] = [];
  const baselineHostMap = new Map(baselineHosts.map((h) => [h.ip, h]));
  const currentHostMap = new Map(currentHosts.map((h) => [h.ip, h]));

  // 1. Detect NEW_HOST (Hosts present in current scan but not baseline)
  for (const [ip, host] of currentHostMap.entries()) {
    if (!baselineHostMap.has(ip)) {
      changes.push({
        id: `change-${scanId}-newhost-${ip.replace(/\./g, '-')}`,
        scanId,
        target,
        hostIp: ip,
        changeType: 'NEW_HOST',
        previousValue: undefined,
        currentValue: host.hostname ? `${ip} (${host.hostname})` : ip,
        severity: 'medium',
        timestamp,
      });
    }
  }

  // 2. Detect REMOVED_HOST (Hosts in baseline that are no longer responsive)
  for (const [ip, host] of baselineHostMap.entries()) {
    if (!currentHostMap.has(ip)) {
      changes.push({
        id: `change-${scanId}-remhost-${ip.replace(/\./g, '-')}`,
        scanId,
        target,
        hostIp: ip,
        changeType: 'REMOVED_HOST',
        previousValue: host.hostname ? `${ip} (${host.hostname})` : ip,
        currentValue: 'Host unreachable or offline',
        severity: 'low',
        timestamp,
      });
    }
  }

  // Helper map for ports: key `${hostIp}:${port}/${protocol}`
  const makePortKey = (p: { hostIp: string; port: number; protocol: string }) =>
    `${p.hostIp}:${p.port}/${p.protocol}`;

  const baselinePortMap = new Map<string, Port>();
  for (const p of baselinePorts) {
    if (p.state === 'open') {
      baselinePortMap.set(makePortKey(p), p);
    }
  }

  const currentPortMap = new Map<string, Port>();
  for (const p of currentPorts) {
    if (p.state === 'open') {
      currentPortMap.set(makePortKey(p), p);
    }
  }

  // 3. Detect PORT_OPENED & SERVICE/VERSION CHANGES
  for (const [key, currPort] of currentPortMap.entries()) {
    const prevPort = baselinePortMap.get(key);

    if (!prevPort) {
      // Port was newly opened
      let severity: SeverityLevel = 'medium';
      if ([22, 3389, 445, 8080].includes(currPort.port)) {
        severity = 'high'; // Remote access and management ports get elevated attention
      }

      changes.push({
        id: `change-${scanId}-portopen-${currPort.hostIp.replace(/\./g, '-')}-${currPort.port}`,
        scanId,
        target,
        hostIp: currPort.hostIp,
        port: currPort.port,
        protocol: currPort.protocol,
        changeType: 'PORT_OPENED',
        previousValue: 'closed/filtered',
        currentValue: `${currPort.port}/${currPort.protocol} open (${currPort.service}${
          currPort.version ? ` ${currPort.version}` : ''
        })`,
        severity,
        timestamp,
      });
    } else {
      // Port was previously open - check service change
      if (prevPort.service && currPort.service && prevPort.service !== currPort.service) {
        changes.push({
          id: `change-${scanId}-svcchange-${currPort.hostIp.replace(/\./g, '-')}-${currPort.port}`,
          scanId,
          target,
          hostIp: currPort.hostIp,
          port: currPort.port,
          protocol: currPort.protocol,
          changeType: 'SERVICE_CHANGED',
          previousValue: prevPort.service,
          currentValue: currPort.service,
          severity: 'medium',
          timestamp,
        });
      }

      // Check version change
      const prevVersionStr = [prevPort.product, prevPort.version].filter(Boolean).join(' ');
      const currVersionStr = [currPort.product, currPort.version].filter(Boolean).join(' ');

      if (prevVersionStr && currVersionStr && prevVersionStr !== currVersionStr) {
        changes.push({
          id: `change-${scanId}-verchange-${currPort.hostIp.replace(/\./g, '-')}-${currPort.port}`,
          scanId,
          target,
          hostIp: currPort.hostIp,
          port: currPort.port,
          protocol: currPort.protocol,
          changeType: 'VERSION_CHANGED',
          previousValue: prevVersionStr,
          currentValue: currVersionStr,
          severity: 'low',
          timestamp,
        });
      }
    }
  }

  // 4. Detect PORT_CLOSED (Ports open in baseline that are no longer open in current)
  for (const [key, prevPort] of baselinePortMap.entries()) {
    // Only check if host is still up
    if (currentHostMap.has(prevPort.hostIp) && !currentPortMap.has(key)) {
      changes.push({
        id: `change-${scanId}-portclose-${prevPort.hostIp.replace(/\./g, '-')}-${prevPort.port}`,
        scanId,
        target,
        hostIp: prevPort.hostIp,
        port: prevPort.port,
        protocol: prevPort.protocol,
        changeType: 'PORT_CLOSED',
        previousValue: `${prevPort.port}/${prevPort.protocol} open (${prevPort.service})`,
        currentValue: 'closed',
        severity: 'low',
        timestamp,
      });
    }
  }

  return changes;
}
