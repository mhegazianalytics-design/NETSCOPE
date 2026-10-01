import { AIAnalysisReport } from '../../types';
import { AIProvider, StructuredScanPayload } from './types';

/**
 * Gemini Provider (Prepared for Phase 5 real integration)
 */
export class GeminiProvider implements AIProvider {
  name: 'gemini' = 'gemini';
  displayName = 'Google Gemini (gemini-2.5-flash)';

  async analyzeScan(payload: StructuredScanPayload): Promise<AIAnalysisReport> {
    // Generate structured findings adhering strictly to observed facts
    const findings = [];

    // Analyze observed remote access
    const remoteAccessHosts = payload.hosts.filter((h) =>
      h.ports.some((p) => [22, 3389, 23, 21].includes(p.port))
    );
    if (remoteAccessHosts.length > 0) {
      findings.push({
        title: 'Exposed Remote Administration Interfaces',
        category: 'Potential concern' as const,
        severity: 'high' as const,
        affectedHost: remoteAccessHosts.map((h) => h.ip).join(', '),
        evidence: `Discovered active listeners: ${remoteAccessHosts
          .map(
            (h) =>
              `${h.ip} (${h.ports
                .filter((p) => [22, 3389, 23, 21].includes(p.port))
                .map((p) => `${p.port}/${p.service}`)
                .join(', ')})`
          )
          .join('; ')}`,
        configurationQuestions: [
          'Are administrative ports restricted to an isolated management VLAN or bastion host?',
          'Is multi-factor authentication (MFA) or strict key-based authentication enforced?',
        ],
        recommendedValidationSteps: [
          'Verify firewall ingress ACLs restrict access to approved operator IPs only.',
          'Audit SSH daemon configuration for PermitRootLogin no and PasswordAuthentication no.',
        ],
        confidence: 0.95,
      });
    }

    // Analyze cleartext HTTP
    const cleartextHosts = payload.hosts.filter((h) =>
      h.ports.some((p) => p.port === 80 || p.service === 'http')
    );
    if (cleartextHosts.length > 0) {
      findings.push({
        title: 'Unencrypted HTTP Services Detected',
        category: 'Observed' as const,
        severity: 'low' as const,
        affectedHost: cleartextHosts.map((h) => h.ip).join(', '),
        evidence: `Active TCP port 80 observed on: ${cleartextHosts.map((h) => h.ip).join(', ')}`,
        configurationQuestions: [
          'Does port 80 issue an immediate HTTP 301/308 redirect to HTTPS (port 443)?',
          'Is HSTS (HTTP Strict Transport Security) enabled?',
        ],
        recommendedValidationSteps: [
          'Perform manual curl -I inspection to confirm automatic upgrade to TLS.',
        ],
        confidence: 0.9,
      });
    }

    // Analyze database ports
    const dbHosts = payload.hosts.filter((h) =>
      h.ports.some((p) => [5432, 3306, 27017, 6379].includes(p.port))
    );
    if (dbHosts.length > 0) {
      findings.push({
        title: 'Direct Database Listener Reachable on Subnet',
        category: 'Needs verification' as const,
        severity: 'medium' as const,
        affectedHost: dbHosts.map((h) => h.ip).join(', '),
        evidence: `Database listeners detected on ${dbHosts
          .map(
            (h) =>
              `${h.ip}:${h.ports
                .filter((p) => [5432, 3306, 27017, 6379].includes(p.port))
                .map((p) => p.port)
                .join(',')}`
          )
          .join(', ')}`,
        configurationQuestions: [
          'Should this database port be reachable by all devices on this subnet, or only application servers?',
        ],
        recommendedValidationSteps: [
          'Inspect pg_hba.conf / my.cnf bind-address and host-based authorization rules.',
        ],
        confidence: 0.88,
      });
    }

    return {
      scanId: `ai-gen-${Date.now()}`,
      target: payload.target,
      generatedAt: new Date().toISOString(),
      provider: 'gemini',
      executiveSummary: `Reconnaissance assessment for target ${payload.target} identified ${
        payload.hosts.length
      } active hosts with ${payload.hosts.reduce(
        (acc, h) => acc + h.ports.length,
        0
      )} open ports. Primary services include web servers, SSH terminals, and internal database infrastructure.`,
      observedServicesSummary: `Detected infrastructure services: ${Array.from(
        new Set(payload.hosts.flatMap((h) => h.ports.map((p) => p.service)))
      ).join(', ')}.`,
      findings,
    };
  }

  async generateExecutiveReport(payload: StructuredScanPayload): Promise<string> {
    return `# NETSCOPE RECONNAISSANCE REPORT
Target: ${payload.target}
Timestamp: ${payload.scanTimestamp}
Active Hosts: ${payload.hosts.length}

## Summary of Discovered Assets
${payload.hosts
  .map(
    (h) =>
      `- Host: ${h.ip} ${h.hostname ? `(${h.hostname})` : ''} — ${h.ports.length} open ports: ${h.ports
        .map((p) => `${p.port}/${p.protocol} [${p.service}]`)
        .join(', ')}`
  )
  .join('\n')}

## Security Recommendations
1. Ensure all management ports are restricted via host firewalls.
2. Review SMB and RDP access on workstation hosts.
3. Validate that cleartext HTTP services enforce HTTPS upgrades.`;
  }
}

export class DeepSeekProvider implements AIProvider {
  name: 'deepseek' = 'deepseek';
  displayName = 'DeepSeek (deepseek-chat)';

  async analyzeScan(payload: StructuredScanPayload): Promise<AIAnalysisReport> {
    const gemini = new GeminiProvider();
    const rep = await gemini.analyzeScan(payload);
    return {
      ...rep,
      provider: 'deepseek',
    };
  }

  async generateExecutiveReport(payload: StructuredScanPayload): Promise<string> {
    const gemini = new GeminiProvider();
    return gemini.generateExecutiveReport(payload);
  }
}
