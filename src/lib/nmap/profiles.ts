/**
 * NETSCOPE Predefined Scan Profiles
 * Safe, controlled reconnaissance operations strictly limited to authorized scopes.
 */

import { ScanProfile, ScanProfileId } from '../../types';

export const SCAN_PROFILES: Record<ScanProfileId, ScanProfile> = {
  'host-discovery': {
    id: 'host-discovery',
    name: 'Host Discovery (Ping Sweep)',
    description: 'Determine which hosts are active on the subnet without port scanning (-sn). Minimal impact.',
    nmapArgs: ['-sn', '-PE', '-PA80,443', '-T3'],
    safeForProduction: true,
    estimatedDuration: '10–30s',
  },
  'common-services': {
    id: 'common-services',
    name: 'Common Services (Top 100)',
    description: 'TCP connect scan on the top 100 most frequent service ports (-sT --top-ports 100).',
    nmapArgs: ['-sT', '--top-ports', '100', '-T3', '--open'],
    safeForProduction: true,
    estimatedDuration: '30–90s',
  },
  'service-detection': {
    id: 'service-detection',
    name: 'Service & Version Detection',
    description: 'Probe open ports to determine service names, products, and version details (-sV).',
    nmapArgs: ['-sT', '-sV', '--version-light', '-T3', '--open'],
    safeForProduction: true,
    estimatedDuration: '1–3 min',
  },
  'custom-authorized': {
    id: 'custom-authorized',
    name: 'Custom Authorized Scan',
    description: 'Scan only the explicit list of monitored ports selected from the operator watchlist.',
    nmapArgs: ['-sT', '-T3', '--open'],
    safeForProduction: true,
    estimatedDuration: '20–60s',
  },
};

/**
 * Builds safe argument array for Nmap child process execution.
 * Guaranteed never to use shell interpolation.
 */
export function buildNmapArgs(options: {
  target: string;
  profileId: ScanProfileId;
  xmlOutputPath: string;
  customPorts?: number[];
}): string[] {
  const profile = SCAN_PROFILES[options.profileId] || SCAN_PROFILES['common-services'];
  const args: string[] = [];

  // Always output XML machine-readable format to stdout or designated file
  args.push('-oX', options.xmlOutputPath);

  // Profile-specific arguments
  args.push(...profile.nmapArgs);

  // If custom ports profile, append validated port list
  if (options.profileId === 'custom-authorized' && options.customPorts && options.customPorts.length > 0) {
    const portArg = options.customPorts.join(',');
    args.push('-p', portArg);
  }

  // Target always as final isolated positional argument
  args.push(options.target);

  return args;
}
