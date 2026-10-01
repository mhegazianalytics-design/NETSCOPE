/**
 * NETSCOPE Canonical Nmap XML Output Parser
 * Extracts normalized Host and Port records from standard Nmap XML (-oX).
 * Safe, resilient, handles both browser DOMParser and Node/test environments.
 */

import { Host, Port } from '../../types';

export interface ParsedXmlResult {
  scanner: string;
  version?: string;
  args?: string;
  startStr?: string;
  hosts: Host[];
  ports: Port[];
  errors: string[];
}

/**
 * Universal XML parser for Nmap -oX output
 */
export function parseNmapXml(xmlContent: string): ParsedXmlResult {
  const result: ParsedXmlResult = {
    scanner: 'nmap',
    hosts: [],
    ports: [],
    errors: [],
  };

  if (!xmlContent || typeof xmlContent !== 'string') {
    result.errors.push('Empty or invalid XML content provided.');
    return result;
  }

  // Quick sanity check for Nmap XML root
  if (!xmlContent.includes('<nmaprun') && !xmlContent.includes('<host')) {
    result.errors.push('Malformed XML: missing <nmaprun> root or <host> elements.');
    return result;
  }

  // Extract nmaprun metadata
  const versionMatch = xmlContent.match(/<nmaprun[^>]*version="([^"]+)"/);
  if (versionMatch) result.version = versionMatch[1];

  const argsMatch = xmlContent.match(/<nmaprun[^>]*args="([^"]+)"/);
  if (argsMatch) result.args = argsMatch[1];

  const now = new Date().toISOString();

  // Extract <host> blocks using regex block matcher (works seamlessly in Node and browser)
  const hostBlockRegex = /<host(?:\s+[^>]*)?>([\s\S]*?)<\/host>/gi;
  let hostMatch: RegExpExecArray | null;
  let hostIndex = 1;

  while ((hostMatch = hostBlockRegex.exec(xmlContent)) !== null) {
    const hostXml = hostMatch[1];

    // Status
    const statusMatch = hostXml.match(/<status\s+state="([^"]+)"/);
    const status = (statusMatch ? statusMatch[1] : 'unknown') as 'up' | 'down';

    // IPv4 Address
    const ipv4Match = hostXml.match(/<address\s+addr="([^"]+)"\s+addrtype="ipv4"/);
    const genericIpMatch = hostXml.match(/<address\s+addr="([^"]+)"/);
    const ip = ipv4Match ? ipv4Match[1] : genericIpMatch ? genericIpMatch[1] : '';

    if (!ip) {
      continue; // Skip host without IP address
    }

    // MAC & Vendor Address
    const macMatch = hostXml.match(/<address\s+addr="([^"]+)"\s+addrtype="mac"(?:\s+vendor="([^"]*)")?/);
    const mac = macMatch ? macMatch[1] : undefined;
    const vendor = macMatch && macMatch[2] ? macMatch[2] : undefined;

    // Hostname
    const hostnameMatch = hostXml.match(/<hostname\s+name="([^"]+)"/);
    const hostname = hostnameMatch ? hostnameMatch[1] : undefined;

    // OS Match if present
    const osMatchRegex = hostXml.match(/<osmatch\s+name="([^"]+)"(?:\s+accuracy="([^"]+)")?/);
    const osMatch = osMatchRegex ? osMatchRegex[1] : undefined;
    const osAccuracy = osMatchRegex && osMatchRegex[2] ? parseInt(osMatchRegex[2], 10) : undefined;

    const hostId = `host-${ip.replace(/[.:]/g, '-')}`;

    // Extract ports for this host
    const hostPorts: Port[] = [];
    const portBlockRegex = /<port\s+protocol="([^"]+)"\s+portid="([^"]+)">([\s\S]*?)<\/port>/gi;
    let portMatch: RegExpExecArray | null;

    while ((portMatch = portBlockRegex.exec(hostXml)) !== null) {
      const protocol = (portMatch[1].toLowerCase() === 'udp' ? 'udp' : 'tcp') as 'tcp' | 'udp';
      const portNum = parseInt(portMatch[2], 10);
      const portInnerXml = portMatch[3];

      // Port State
      const stateMatch = portInnerXml.match(/<state\s+state="([^"]+)"/);
      const state = (stateMatch ? stateMatch[1] : 'unknown') as 'open' | 'closed' | 'filtered';

      // Service & Product & Version
      const serviceMatch = portInnerXml.match(/<service\s+name="([^"]+)"(?:\s+product="([^"]*)")?(?:\s+version="([^"]*)")?(?:\s+extrainfo="([^"]*)")?/);
      const serviceName = serviceMatch && serviceMatch[1] ? serviceMatch[1] : 'unknown';
      const product = serviceMatch && serviceMatch[2] ? serviceMatch[2] : undefined;
      const version = serviceMatch && serviceMatch[3] ? serviceMatch[3] : undefined;
      const extraInfo = serviceMatch && serviceMatch[4] ? serviceMatch[4] : undefined;

      const portRecord: Port = {
        id: `port-${ip.replace(/[.:]/g, '-')}-${portNum}-${protocol}`,
        hostId,
        hostIp: ip,
        port: portNum,
        protocol,
        state,
        service: serviceName,
        product,
        version,
        extraInfo,
        firstSeen: now,
        lastSeen: now,
      };

      hostPorts.push(portRecord);
      result.ports.push(portRecord);
    }

    const hostRecord: Host = {
      id: hostId,
      ip,
      hostname,
      mac,
      vendor,
      status: status === 'up' ? 'up' : 'down',
      osMatch,
      osAccuracy,
      firstSeen: now,
      lastSeen: now,
      openPortsCount: hostPorts.filter((p) => p.state === 'open').length,
    };

    result.hosts.push(hostRecord);
    hostIndex++;
  }

  return result;
}
