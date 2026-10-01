import { AIAnalysisFinding, AIAnalysisReport, Host, Port } from '../../types';

export interface StructuredScanPayload {
  target: string;
  scanTimestamp: string;
  profileUsed: string;
  hosts: {
    ip: string;
    hostname?: string;
    vendor?: string;
    status: 'up' | 'down';
    ports: {
      port: number;
      protocol: 'tcp' | 'udp';
      state: 'open' | 'closed' | 'filtered';
      service: string;
      product?: string;
      version?: string;
    }[];
  }[];
  detectedChanges?: {
    type: string;
    hostIp: string;
    port?: number;
    details: string;
  }[];
}

export interface AIProvider {
  name: 'gemini' | 'deepseek';
  displayName: string;
  analyzeScan(payload: StructuredScanPayload): Promise<AIAnalysisReport>;
  generateExecutiveReport(payload: StructuredScanPayload): Promise<string>;
}

/**
 * Normalizes host & port database records into the strict structured payload for AI
 */
export function buildStructuredAIPayload(
  target: string,
  profile: string,
  hosts: Host[],
  ports: Port[]
): StructuredScanPayload {
  const hostMap = new Map<string, typeof payloadHosts[0]>();

  const payloadHosts = hosts.map((h) => ({
    ip: h.ip,
    hostname: h.hostname,
    vendor: h.vendor,
    status: h.status,
    ports: [] as StructuredScanPayload['hosts'][0]['ports'],
  }));

  for (const ph of payloadHosts) {
    hostMap.set(ph.ip, ph);
  }

  for (const p of ports) {
    if (p.state === 'open') {
      const h = hostMap.get(p.hostIp);
      if (h) {
        h.ports.push({
          port: p.port,
          protocol: p.protocol,
          state: p.state,
          service: p.service,
          product: p.product,
          version: p.version,
        });
      }
    }
  }

  return {
    target,
    scanTimestamp: new Date().toISOString(),
    profileUsed: profile,
    hosts: payloadHosts,
  };
}
