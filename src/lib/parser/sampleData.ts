/**
 * NETSCOPE Mock Datasets & Sample XML Fixtures
 * Used for development, testing, and Phase 1 UI verification without requiring real raw network scans.
 */

import { Host, MonitoringJob, Port, Scan, ScanChange } from '../../types';

export const SAMPLE_NMAP_XML_BASIC = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nmaprun>
<nmaprun scanner="nmap" args="nmap -sT --top-ports 100 -T3 -oX sample-basic.xml 192.168.1.0/24" start="1727800000" version="7.94">
  <host starttime="1727800001" endtime="1727800015">
    <status state="up" reason="arp-response"/>
    <address addr="192.168.1.1" addrtype="ipv4"/>
    <address addr="00:11:22:33:44:55" addrtype="mac" vendor="Cisco Systems"/>
    <hostnames><hostname name="gateway.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="53"><state state="open" reason="syn-ack"/><service name="domain" product="dnsmasq" version="2.85"/></port>
      <port protocol="tcp" portid="80"><state state="open" reason="syn-ack"/><service name="http" product="nginx" version="1.22.1"/></port>
      <port protocol="tcp" portid="443"><state state="open" reason="syn-ack"/><service name="https" product="nginx" version="1.22.1"/></port>
    </ports>
  </host>
  <host starttime="1727800005" endtime="1727800020">
    <status state="up" reason="echo-reply"/>
    <address addr="192.168.1.20" addrtype="ipv4"/>
    <address addr="AA:BB:CC:DD:EE:01" addrtype="mac" vendor="Dell Inc."/>
    <hostnames><hostname name="app-srv-01.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="80"><state state="open" reason="syn-ack"/><service name="http" product="Apache httpd" version="2.4.52"/></port>
      <port protocol="tcp" portid="443"><state state="open" reason="syn-ack"/><service name="https" product="Apache httpd" version="2.4.52"/></port>
    </ports>
  </host>
  <host starttime="1727800008" endtime="1727800025">
    <status state="up" reason="echo-reply"/>
    <address addr="192.168.1.50" addrtype="ipv4"/>
    <address addr="AA:BB:CC:DD:EE:02" addrtype="mac" vendor="Intel Corporate"/>
    <hostnames><hostname name="db-primary.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="open" reason="syn-ack"/><service name="ssh" product="OpenSSH" version="8.9p1"/></port>
      <port protocol="tcp" portid="5432"><state state="open" reason="syn-ack"/><service name="postgresql" product="PostgreSQL DB" version="15.4"/></port>
    </ports>
  </host>
</nmaprun>`;

export const SAMPLE_NMAP_XML_CHANGES = `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE nmaprun>
<nmaprun scanner="nmap" args="nmap -sT --top-ports 100 -T3 -oX sample-changes.xml 192.168.1.0/24" start="1727803600" version="7.94">
  <!-- Host 1.1 unchanged -->
  <host starttime="1727803601" endtime="1727803615">
    <status state="up" reason="arp-response"/>
    <address addr="192.168.1.1" addrtype="ipv4"/>
    <address addr="00:11:22:33:44:55" addrtype="mac" vendor="Cisco Systems"/>
    <hostnames><hostname name="gateway.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="53"><state state="open" reason="syn-ack"/><service name="domain" product="dnsmasq" version="2.85"/></port>
      <port protocol="tcp" portid="80"><state state="open" reason="syn-ack"/><service name="http" product="nginx" version="1.22.1"/></port>
      <port protocol="tcp" portid="443"><state state="open" reason="syn-ack"/><service name="https" product="nginx" version="1.22.1"/></port>
    </ports>
  </host>
  <!-- Host 1.20 has port 22 OPENED and port 80 CLOSED, 443 still open -->
  <host starttime="1727803605" endtime="1727803620">
    <status state="up" reason="echo-reply"/>
    <address addr="192.168.1.20" addrtype="ipv4"/>
    <address addr="AA:BB:CC:DD:EE:01" addrtype="mac" vendor="Dell Inc."/>
    <hostnames><hostname name="app-srv-01.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="open" reason="syn-ack"/><service name="ssh" product="OpenSSH" version="9.0p1"/></port>
      <port protocol="tcp" portid="443"><state state="open" reason="syn-ack"/><service name="https" product="Apache httpd" version="2.4.54"/></port>
    </ports>
  </host>
  <!-- Host 1.50 is now DOWN / unreachable -->
  <!-- Host 1.99 is a BRAND NEW host -->
  <host starttime="1727803625" endtime="1727803640">
    <status state="up" reason="echo-reply"/>
    <address addr="192.168.1.99" addrtype="ipv4"/>
    <address addr="CC:DD:EE:FF:00:11" addrtype="mac" vendor="Raspberry Pi Foundation"/>
    <hostnames><hostname name="iot-dev-station.local" type="PTR"/></hostnames>
    <ports>
      <port protocol="tcp" portid="22"><state state="open" reason="syn-ack"/><service name="ssh" product="OpenSSH" version="9.2p1"/></port>
      <port protocol="tcp" portid="8080"><state state="open" reason="syn-ack"/><service name="http-proxy" product="Node.js Express" version="4.18"/></port>
    </ports>
  </host>
</nmaprun>`;

export const INITIAL_MOCK_HOSTS: Host[] = [
  {
    id: 'host-1',
    ip: '192.168.1.1',
    hostname: 'gateway.lan',
    mac: '00:11:22:33:44:55',
    vendor: 'Cisco Systems',
    status: 'up',
    osMatch: 'Linux 5.15 RouterOS',
    osAccuracy: 96,
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
    openPortsCount: 3,
  },
  {
    id: 'host-2',
    ip: '192.168.1.20',
    hostname: 'app-srv-01.lan',
    mac: 'AA:BB:CC:DD:EE:01',
    vendor: 'Dell Inc.',
    status: 'up',
    osMatch: 'Ubuntu Linux 22.04 LTS',
    osAccuracy: 99,
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
    openPortsCount: 2,
  },
  {
    id: 'host-3',
    ip: '192.168.1.25',
    hostname: 'nas-storage.lan',
    mac: '00:11:32:88:99:AA',
    vendor: 'Synology Inc.',
    status: 'up',
    osMatch: 'Synology DSM 7.2',
    osAccuracy: 95,
    firstSeen: '2026-09-29T10:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
    openPortsCount: 4,
  },
  {
    id: 'host-4',
    ip: '192.168.1.50',
    hostname: 'db-primary.lan',
    mac: 'AA:BB:CC:DD:EE:02',
    vendor: 'Intel Corporate',
    status: 'up',
    osMatch: 'Debian GNU/Linux 12',
    osAccuracy: 98,
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
    openPortsCount: 2,
  },
  {
    id: 'host-5',
    ip: '192.168.1.105',
    hostname: 'dev-workstation-win.lan',
    mac: 'B4:2E:99:11:22:33',
    vendor: 'Hewlett Packard Enterprise',
    status: 'up',
    osMatch: 'Microsoft Windows 11 Enterprise',
    osAccuracy: 92,
    firstSeen: '2026-09-30T12:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
    openPortsCount: 3,
  },
  {
    id: 'host-6',
    ip: '192.168.1.140',
    hostname: 'printer-office.lan',
    mac: '00:1E:8F:44:55:66',
    vendor: 'Canon Inc.',
    status: 'up',
    osMatch: 'Embedded RTOS',
    osAccuracy: 88,
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
    openPortsCount: 2,
  },
];

export const INITIAL_MOCK_PORTS: Port[] = [
  // 192.168.1.1 Gateway
  {
    id: 'port-1-53',
    hostId: 'host-1',
    hostIp: '192.168.1.1',
    port: 53,
    protocol: 'tcp',
    state: 'open',
    service: 'domain',
    product: 'dnsmasq',
    version: '2.85',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-1-80',
    hostId: 'host-1',
    hostIp: '192.168.1.1',
    port: 80,
    protocol: 'tcp',
    state: 'open',
    service: 'http',
    product: 'nginx',
    version: '1.22.1',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-1-443',
    hostId: 'host-1',
    hostIp: '192.168.1.1',
    port: 443,
    protocol: 'tcp',
    state: 'open',
    service: 'https',
    product: 'nginx',
    version: '1.22.1',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },

  // 192.168.1.20 App Server
  {
    id: 'port-2-22',
    hostId: 'host-2',
    hostIp: '192.168.1.20',
    port: 22,
    protocol: 'tcp',
    state: 'open',
    service: 'ssh',
    product: 'OpenSSH',
    version: '9.0p1',
    firstSeen: '2026-10-01T15:45:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-2-443',
    hostId: 'host-2',
    hostIp: '192.168.1.20',
    port: 443,
    protocol: 'tcp',
    state: 'open',
    service: 'https',
    product: 'Apache httpd',
    version: '2.4.54',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },

  // 192.168.1.25 NAS
  {
    id: 'port-3-80',
    hostId: 'host-3',
    hostIp: '192.168.1.25',
    port: 80,
    protocol: 'tcp',
    state: 'open',
    service: 'http',
    product: 'Synology Web Station',
    version: '7.2',
    firstSeen: '2026-09-29T10:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-3-443',
    hostId: 'host-3',
    hostIp: '192.168.1.25',
    port: 443,
    protocol: 'tcp',
    state: 'open',
    service: 'https',
    product: 'Synology Web Station',
    version: '7.2',
    firstSeen: '2026-09-29T10:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-3-445',
    hostId: 'host-3',
    hostIp: '192.168.1.25',
    port: 445,
    protocol: 'tcp',
    state: 'open',
    service: 'microsoft-ds',
    product: 'Samba smbd',
    version: '4.15.9',
    firstSeen: '2026-09-29T10:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-3-5000',
    hostId: 'host-3',
    hostIp: '192.168.1.25',
    port: 5000,
    protocol: 'tcp',
    state: 'open',
    service: 'http',
    product: 'Synology DSM Admin',
    version: '7.2',
    firstSeen: '2026-09-29T10:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },

  // 192.168.1.50 DB
  {
    id: 'port-4-22',
    hostId: 'host-4',
    hostIp: '192.168.1.50',
    port: 22,
    protocol: 'tcp',
    state: 'open',
    service: 'ssh',
    product: 'OpenSSH',
    version: '8.9p1',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-4-5432',
    hostId: 'host-4',
    hostIp: '192.168.1.50',
    port: 5432,
    protocol: 'tcp',
    state: 'open',
    service: 'postgresql',
    product: 'PostgreSQL DB',
    version: '15.4',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },

  // 192.168.1.105 Dev Workstation
  {
    id: 'port-5-135',
    hostId: 'host-5',
    hostIp: '192.168.1.105',
    port: 135,
    protocol: 'tcp',
    state: 'open',
    service: 'msrpc',
    product: 'Microsoft Windows RPC',
    firstSeen: '2026-09-30T12:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-5-445',
    hostId: 'host-5',
    hostIp: '192.168.1.105',
    port: 445,
    protocol: 'tcp',
    state: 'open',
    service: 'microsoft-ds',
    product: 'Windows LanManager',
    firstSeen: '2026-09-30T12:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-5-3389',
    hostId: 'host-5',
    hostIp: '192.168.1.105',
    port: 3389,
    protocol: 'tcp',
    state: 'open',
    service: 'ms-wbt-server',
    product: 'Microsoft Terminal Services',
    firstSeen: '2026-09-30T12:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },

  // 192.168.1.140 Printer
  {
    id: 'port-6-80',
    hostId: 'host-6',
    hostIp: '192.168.1.140',
    port: 80,
    protocol: 'tcp',
    state: 'open',
    service: 'http',
    product: 'Canon HTTP Server',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
  {
    id: 'port-6-9100',
    hostId: 'host-6',
    hostIp: '192.168.1.140',
    port: 9100,
    protocol: 'tcp',
    state: 'open',
    service: 'jetdirect',
    product: 'HP JetDirect / RAW print',
    firstSeen: '2026-09-28T08:00:00Z',
    lastSeen: '2026-10-01T15:45:00Z',
  },
];

export const INITIAL_MOCK_SCANS: Scan[] = [
  {
    id: 'scan-1002',
    target: '192.168.1.0/24',
    profileId: 'service-detection',
    profileName: 'Service & Version Detection',
    startedAt: '2026-10-01T15:43:10Z',
    completedAt: '2026-10-01T15:45:22Z',
    durationSeconds: 132,
    status: 'completed',
    hostsDiscovered: 6,
    openPortsDiscovered: 16,
    changesDetected: 3,
    rawOutputPath: '/var/lib/netscope/scans/scan-1002.xml',
  },
  {
    id: 'scan-1001',
    target: '192.168.1.0/24',
    profileId: 'common-services',
    profileName: 'Common Services (Top 100)',
    startedAt: '2026-10-01T14:00:00Z',
    completedAt: '2026-10-01T14:01:45Z',
    durationSeconds: 105,
    status: 'completed',
    hostsDiscovered: 6,
    openPortsDiscovered: 15,
    changesDetected: 0,
    rawOutputPath: '/var/lib/netscope/scans/scan-1001.xml',
  },
  {
    id: 'scan-1000',
    target: '192.168.1.0/24',
    profileId: 'host-discovery',
    profileName: 'Host Discovery (Ping Sweep)',
    startedAt: '2026-09-30T10:00:00Z',
    completedAt: '2026-09-30T10:00:24Z',
    durationSeconds: 24,
    status: 'completed',
    hostsDiscovered: 5,
    openPortsDiscovered: 0,
    changesDetected: 1,
    rawOutputPath: '/var/lib/netscope/scans/scan-1000.xml',
  },
];

export const INITIAL_MOCK_CHANGES: ScanChange[] = [
  {
    id: 'change-1',
    scanId: 'scan-1002',
    target: '192.168.1.0/24',
    hostIp: '192.168.1.20',
    port: 22,
    protocol: 'tcp',
    changeType: 'PORT_OPENED',
    previousValue: 'closed/filtered',
    currentValue: '22/tcp open (ssh OpenSSH 9.0p1)',
    severity: 'high',
    timestamp: '2026-10-01T15:45:10Z',
  },
  {
    id: 'change-2',
    scanId: 'scan-1002',
    target: '192.168.1.0/24',
    hostIp: '192.168.1.20',
    port: 80,
    protocol: 'tcp',
    changeType: 'PORT_CLOSED',
    previousValue: '80/tcp open (Apache httpd)',
    currentValue: 'closed',
    severity: 'low',
    timestamp: '2026-10-01T15:45:11Z',
  },
  {
    id: 'change-3',
    scanId: 'scan-1002',
    target: '192.168.1.0/24',
    hostIp: '192.168.1.20',
    port: 443,
    protocol: 'tcp',
    changeType: 'VERSION_CHANGED',
    previousValue: 'Apache httpd 2.4.52',
    currentValue: 'Apache httpd 2.4.54',
    severity: 'low',
    timestamp: '2026-10-01T15:45:12Z',
  },
  {
    id: 'change-4',
    scanId: 'scan-1000',
    target: '192.168.1.0/24',
    hostIp: '192.168.1.105',
    changeType: 'NEW_HOST',
    previousValue: undefined,
    currentValue: '192.168.1.105 (dev-workstation-win.lan)',
    severity: 'medium',
    timestamp: '2026-09-30T10:00:20Z',
  },
];

export const INITIAL_MOCK_MONITORING_JOBS: MonitoringJob[] = [
  {
    id: 'job-1',
    name: 'Office Subnet Watch',
    target: '192.168.1.0/24',
    profileId: 'custom-authorized',
    intervalSeconds: 60,
    watchPorts: [22, 80, 443, 445, 3389],
    status: 'active',
    lastRunAt: '2026-10-01T15:45:22Z',
    nextRunAt: '2026-10-01T15:46:22Z',
    totalRuns: 28,
    detectedChangesCount: 3,
    createdAt: '2026-09-28T09:00:00Z',
  },
  {
    id: 'job-2',
    name: 'Gateway Ingress Audit',
    target: '192.168.1.1',
    profileId: 'common-services',
    intervalSeconds: 300,
    watchPorts: [53, 80, 443, 8080],
    status: 'paused',
    lastRunAt: '2026-10-01T14:30:00Z',
    nextRunAt: undefined,
    totalRuns: 42,
    detectedChangesCount: 0,
    createdAt: '2026-09-28T10:00:00Z',
  },
];
