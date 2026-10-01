import React, { useState } from 'react';
import {
  FileText,
  Download,
  Cpu,
  ShieldAlert,
  HelpCircle,
  CheckCircle2,
  Copy,
  Check,
  AlertTriangle,
  Code,
} from 'lucide-react';
import { Host, Port, ScanChange, AIAnalysisReport } from '../../types';
import { buildStructuredAIPayload } from '../../lib/ai/types';
import { GeminiProvider, DeepSeekProvider } from '../../lib/ai/provider';
import { db } from '../../lib/database/mockStorage';

interface ReportsPageProps {
  hosts: Host[];
  ports: Port[];
  changes: ScanChange[];
}

export const ReportsPage: React.FC<ReportsPageProps> = ({ hosts, ports, changes }) => {
  const settings = db.getSettings();
  const [selectedFormat, setSelectedFormat] = useState<'markdown' | 'json' | 'csv'>('markdown');
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [aiReport, setAiReport] = useState<AIAnalysisReport | null>(null);
  const [copied, setCopied] = useState(false);
  const [showRawPayload, setShowRawPayload] = useState(false);

  const target = hosts.length > 0 ? '192.168.1.0/24' : 'N/A';
  const structuredPayload = buildStructuredAIPayload(target, 'common-services', hosts, ports);

  const handleRunAiAnalysis = async () => {
    setIsAnalyzing(true);
    try {
      const provider =
        settings.aiProvider === 'deepseek' ? new DeepSeekProvider() : new GeminiProvider();
      const report = await provider.analyzeScan(structuredPayload);
      setAiReport(report);
    } finally {
      setIsAnalyzing(false);
    }
  };

  const generateMarkdownReport = () => {
    return `# NETSCOPE RECONNAISSANCE AUDIT REPORT
**Target Subnet:** ${target}  
**Assessment Date:** ${new Date().toISOString()}  
**Operator Scope:** Authorized internal network security assessment  
**Execution Environment:** Isolated local desktop runner  

---

## 1. Executive Summary
NETSCOPE completed automated non-intrusive reconnaissance across the specified scope. 
- Discovered Active Hosts: ${hosts.length}
- Total Open Port Bindings: ${ports.filter((p) => p.state === 'open').length}
- Baseline Drift / Changes: ${changes.length}

---

## 2. Asset & Port Inventory
${hosts
  .map((h) => {
    const hPorts = ports.filter((p) => p.hostIp === h.ip && p.state === 'open');
    return `### Host: ${h.ip} ${h.hostname ? `(${h.hostname})` : ''}
- Status: ${h.status.toUpperCase()}
- Hardware MAC: ${h.mac || 'N/A'} (${h.vendor || 'Unknown'})
- Open Ports:
${
  hPorts.length === 0
    ? '  - None identified'
    : hPorts
        .map(
          (p) =>
            `  - ${p.port}/${p.protocol} (${p.service}) ${[p.product, p.version].filter(Boolean).join(' ')}`
        )
        .join('\n')
}`;
  })
  .join('\n\n')}

---

## 3. Detected Baseline Changes
${
  changes.length === 0
    ? 'No baseline changes identified.'
    : changes
        .map(
          (c) =>
            `- [${c.changeType}] Host ${c.hostIp}${c.port ? ` Port ${c.port}` : ''}: ${c.currentValue} (Previously: ${c.previousValue || 'None'})`
        )
        .join('\n')
}
`;
  };

  const generateCsvReport = () => {
    const headers = ['Host_IP', 'Hostname', 'MAC', 'Vendor', 'Port', 'Protocol', 'Service', 'Product', 'Version', 'State'];
    const rows: string[] = [headers.join(',')];

    for (const h of hosts) {
      const hPorts = ports.filter((p) => p.hostIp === h.ip && p.state === 'open');
      if (hPorts.length === 0) {
        rows.push([h.ip, h.hostname || '', h.mac || '', h.vendor || '', '', '', '', '', '', h.status].map((v) => `"${v}"`).join(','));
      } else {
        for (const p of hPorts) {
          rows.push([
            h.ip,
            h.hostname || '',
            h.mac || '',
            h.vendor || '',
            p.port.toString(),
            p.protocol,
            p.service,
            p.product || '',
            p.version || '',
            p.state,
          ].map((v) => `"${v}"`).join(','));
        }
      }
    }
    return rows.join('\n');
  };

  const exportContent =
    selectedFormat === 'markdown'
      ? generateMarkdownReport()
      : selectedFormat === 'json'
      ? JSON.stringify(structuredPayload, null, 2)
      : generateCsvReport();

  const handleDownload = () => {
    const blob = new Blob([exportContent], {
      type: selectedFormat === 'json' ? 'application/json' : 'text/plain',
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `netscope-report-${Date.now()}.${selectedFormat === 'json' ? 'json' : selectedFormat === 'csv' ? 'csv' : 'md'}`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleCopy = () => {
    navigator.clipboard.writeText(exportContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-100">
            Reconnaissance Assessment Reports
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Export structured findings, generate audit reports, or invoke structured AI analysis.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={handleRunAiAnalysis}
            disabled={isAnalyzing}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-950 font-bold text-xs rounded transition-colors shadow-xs"
          >
            <Cpu className="w-4 h-4" />
            <span>{isAnalyzing ? 'Analyzing Structured Payload...' : 'ANALYZE WITH AI'}</span>
          </button>

          <button
            onClick={() => setShowRawPayload(!showRawPayload)}
            className="flex items-center gap-1.5 px-3 py-1.5 border border-neutral-700 bg-neutral-900 hover:bg-neutral-800 text-neutral-300 text-xs font-mono rounded transition-colors"
          >
            <Code className="w-3.5 h-3.5 text-cyan-400" />
            <span>{showRawPayload ? 'Hide AI Payload' : 'View AI Payload'}</span>
          </button>
        </div>
      </div>

      {/* AI Structured Payload Preview Drawer */}
      {showRawPayload && (
        <div className="p-4 bg-neutral-950 border border-neutral-800 rounded space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-mono font-semibold text-neutral-200">
              STRUCTURED AI INPUT PAYLOAD (SCHEMA VERIFIED · NO SHELL ACCESS)
            </span>
            <span className="text-[11px] font-mono text-neutral-500">
              Structured JSON object passed to LLM context
            </span>
          </div>
          <pre className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs font-mono text-cyan-300 overflow-x-auto max-h-60">
            {JSON.stringify(structuredPayload, null, 2)}
          </pre>
        </div>
      )}

      {/* AI Analysis Findings Display */}
      {aiReport && (
        <div className="bg-neutral-900 border border-cyan-900/60 rounded p-5 space-y-5">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-3">
            <div className="flex items-center gap-2">
              <Cpu className="w-5 h-5 text-cyan-400" />
              <div>
                <h2 className="text-sm font-bold text-neutral-100 uppercase tracking-wider font-mono">
                  AI Structured Assessment ({aiReport.provider.toUpperCase()})
                </h2>
                <span className="text-xs text-neutral-400">
                  Target: {aiReport.target} · Generated {new Date(aiReport.generatedAt).toLocaleTimeString()}
                </span>
              </div>
            </div>

            <div className="text-xs font-mono text-emerald-400 flex items-center gap-1">
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Evidence-Grounding Enforced</span>
            </div>
          </div>

          {/* Executive Summary */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs space-y-1">
            <span className="text-neutral-500 font-mono text-[11px] uppercase block">
              Executive Summary
            </span>
            <p className="text-neutral-200 leading-relaxed">{aiReport.executiveSummary}</p>
          </div>

          {/* Categorized Findings */}
          <div className="space-y-3">
            <span className="text-xs font-mono font-semibold text-neutral-300 uppercase tracking-wider block">
              Structured Findings ({aiReport.findings.length})
            </span>

            <div className="space-y-3">
              {aiReport.findings.map((finding, idx) => (
                <div
                  key={idx}
                  className="p-4 bg-neutral-950 border border-neutral-800 rounded space-y-3"
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <span
                        className={`text-xs font-mono px-2 py-0.5 rounded font-semibold ${
                          finding.category === 'Potential concern'
                            ? 'bg-amber-950 text-amber-300 border border-amber-800'
                            : finding.category === 'Needs verification'
                            ? 'bg-cyan-950 text-cyan-300 border border-cyan-800'
                            : 'bg-neutral-800 text-neutral-300 border border-neutral-700'
                        }`}
                      >
                        {finding.category}
                      </span>
                      <span className="font-semibold text-xs text-neutral-100">
                        {finding.title}
                      </span>
                    </div>

                    <span className="text-xs font-mono text-neutral-500">
                      Confidence: {(finding.confidence * 100).toFixed(0)}%
                    </span>
                  </div>

                  {/* Evidence attribution */}
                  <div className="text-xs font-mono text-neutral-400 bg-neutral-900 p-2.5 rounded border border-neutral-800/80">
                    <span className="text-neutral-500 block text-[10px] uppercase">
                      Observed Evidence
                    </span>
                    <span className="text-neutral-200">{finding.evidence}</span>
                  </div>

                  {/* Configuration Questions */}
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-400 font-mono text-[11px]">
                      <HelpCircle className="w-3.5 h-3.5 text-cyan-400" />
                      <span>CONFIGURATION QUESTIONS FOR NETWORK ADMIN:</span>
                    </div>
                    <ul className="list-disc list-inside text-neutral-300 space-y-0.5 pl-1">
                      {finding.configurationQuestions.map((q, qIdx) => (
                        <li key={qIdx}>{q}</li>
                      ))}
                    </ul>
                  </div>

                  {/* Recommended Validation Steps */}
                  <div className="space-y-1 text-xs">
                    <div className="flex items-center gap-1.5 text-neutral-400 font-mono text-[11px]">
                      <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                      <span>RECOMMENDED OPERATOR VALIDATION STEPS:</span>
                    </div>
                    <ul className="list-disc list-inside text-neutral-300 space-y-0.5 pl-1">
                      {finding.recommendedValidationSteps.map((step, sIdx) => (
                        <li key={sIdx}>{step}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Export Section */}
      <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
              Export Audit Data
            </h2>
          </div>

          <div className="flex items-center gap-2">
            <div className="flex items-center bg-neutral-950 border border-neutral-800 rounded p-0.5 text-xs font-mono">
              <button
                onClick={() => setSelectedFormat('markdown')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  selectedFormat === 'markdown'
                    ? 'bg-neutral-800 text-cyan-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                Markdown
              </button>
              <button
                onClick={() => setSelectedFormat('json')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  selectedFormat === 'json'
                    ? 'bg-neutral-800 text-cyan-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                JSON
              </button>
              <button
                onClick={() => setSelectedFormat('csv')}
                className={`px-2.5 py-1 rounded transition-colors ${
                  selectedFormat === 'csv'
                    ? 'bg-neutral-800 text-cyan-300'
                    : 'text-neutral-400 hover:text-neutral-200'
                }`}
              >
                CSV
              </button>
            </div>

            <button
              onClick={handleCopy}
              className="p-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded border border-neutral-700 transition-colors"
              title="Copy to clipboard"
            >
              {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            </button>

            <button
              onClick={handleDownload}
              className="flex items-center gap-1.5 px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono rounded border border-neutral-700 transition-colors"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Download File</span>
            </button>
          </div>
        </div>

        {/* Preview Code View */}
        <pre className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs font-mono text-neutral-300 max-h-72 overflow-y-auto overflow-x-auto select-text leading-relaxed">
          {exportContent}
        </pre>
      </div>
    </div>
  );
};
