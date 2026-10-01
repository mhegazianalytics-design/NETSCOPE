import React, { useState, useEffect } from 'react';
import {
  Save,
  RotateCcw,
  CheckCircle2,
  Key,
  Shield,
  Terminal,
  Clock,
  RefreshCw,
  AlertCircle,
  HelpCircle,
} from 'lucide-react';
import { ScanProfileId } from '../../types';
import { NmapStatus } from '../../types/nmap';
import { db } from '../../lib/database/mockStorage';
import { desktopBridge } from '../../desktop/bridge';

interface SettingsPageProps {
  onSettingsSaved?: () => void;
}

export const SettingsPage: React.FC<SettingsPageProps> = ({ onSettingsSaved }) => {
  const currentSettings = db.getSettings();

  const [nmapPath, setNmapPath] = useState(currentSettings.nmapPath);
  const [databasePath, setDatabasePath] = useState(currentSettings.databasePath);
  const [mockMode, setMockMode] = useState(currentSettings.mockMode);
  const [defaultProfile, setDefaultProfile] = useState<ScanProfileId>(currentSettings.defaultScanProfile);
  const [defaultInterval, setDefaultInterval] = useState(currentSettings.defaultMonitoringInterval);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'deepseek'>(currentSettings.aiProvider);
  const [geminiApiKey, setGeminiApiKey] = useState('');
  const [deepseekApiKey, setDeepseekApiKey] = useState('');
  const [allowedSubnetsStr, setAllowedSubnetsStr] = useState(currentSettings.allowedSubnets.join(', '));
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Live Nmap Status State
  const [detectedStatus, setDetectedStatus] = useState<NmapStatus | null>(null);
  const [isDetecting, setIsDetecting] = useState(false);

  const testNmapBinary = async (pathToTest: string) => {
    setIsDetecting(true);
    try {
      const status = await desktopBridge.getNmapStatus(pathToTest);
      setDetectedStatus(status);
    } finally {
      setIsDetecting(false);
    }
  };

  useEffect(() => {
    testNmapBinary(currentSettings.nmapPath);
  }, []);

  const handleSave = (e: React.FormEvent) => {
    e.preventDefault();

    const subnets = allowedSubnetsStr
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);

    db.updateSettings({
      nmapPath: nmapPath.trim(),
      databasePath: databasePath.trim(),
      mockMode,
      defaultScanProfile: defaultProfile,
      defaultMonitoringInterval: Number(defaultInterval) || 60,
      aiProvider,
      geminiApiKeyConfigured: !!geminiApiKey || currentSettings.geminiApiKeyConfigured,
      deepseekApiKeyConfigured: !!deepseekApiKey || currentSettings.deepseekApiKeyConfigured,
      allowedSubnets: subnets.length > 0 ? subnets : currentSettings.allowedSubnets,
    });

    setSavedSuccess(true);
    setTimeout(() => setSavedSuccess(false), 3000);
    onSettingsSaved?.();
  };

  const handleResetFactory = () => {
    if (window.confirm('Reset all scans, hosts, and settings back to factory sample fixtures?')) {
      db.resetToFactoryMock();
      const updated = db.getSettings();
      setNmapPath(updated.nmapPath);
      setDatabasePath(updated.databasePath);
      setMockMode(updated.mockMode);
      setDefaultProfile(updated.defaultScanProfile);
      setDefaultInterval(updated.defaultMonitoringInterval);
      setAiProvider(updated.aiProvider);
      setAllowedSubnetsStr(updated.allowedSubnets.join(', '));
      testNmapBinary(updated.nmapPath);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3000);
    }
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Title */}
      <div>
        <h1 className="text-xl font-bold tracking-tight text-neutral-100">
          System Settings & Platform Boundaries
        </h1>
        <p className="text-xs text-neutral-400 mt-1">
          Configure local paths, binary runners, scope boundary constraints, and execution modes.
        </p>
      </div>

      <form onSubmit={handleSave} className="space-y-6">
        {/* Execution Mode Selector (Section 11) */}
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <Terminal className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
              Scanner Execution Mode
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {/* Mode 1: Mock Mode */}
            <label
              className={`p-3.5 rounded border transition-all cursor-pointer flex flex-col justify-between ${
                mockMode
                  ? 'bg-neutral-800/90 border-amber-500/80 shadow-xs'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-neutral-100 font-mono">
                    MOCK MODE (SAFE SIMULATION)
                  </span>
                  <input
                    type="radio"
                    name="executionMode"
                    checked={mockMode}
                    onChange={() => setMockMode(true)}
                    className="accent-amber-500"
                  />
                </div>
                <p className="text-xs text-neutral-400 leading-snug">
                  Uses pre-packaged XML fixtures. Does not require Nmap installed and sends no packets. Ideal for development and demonstration.
                </p>
              </div>
              <div className="mt-3 text-[11px] font-mono text-amber-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                <span>Deterministic baseline drift engine active</span>
              </div>
            </label>

            {/* Mode 2: Real Nmap Mode */}
            <label
              className={`p-3.5 rounded border transition-all cursor-pointer flex flex-col justify-between ${
                !mockMode
                  ? 'bg-neutral-800/90 border-cyan-500/80 shadow-xs'
                  : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
              }`}
            >
              <div className="space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-xs text-neutral-100 font-mono">
                    REAL NMAP (LOCAL NATIVE BINARY)
                  </span>
                  <input
                    type="radio"
                    name="executionMode"
                    checked={!mockMode}
                    onChange={() => setMockMode(false)}
                    className="accent-cyan-500"
                  />
                </div>
                <p className="text-xs text-neutral-400 leading-snug">
                  Executes the locally installed Nmap binary using vector argument isolation and captures XML artifacts directly.
                </p>
              </div>
              <div className="mt-3 text-[11px] font-mono text-cyan-400 flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
                <span>Runs child process via desktop/server bridge</span>
              </div>
            </label>
          </div>
        </div>

        {/* Nmap Executable Verification & Path (Section 4) */}
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-4">
          <div className="flex items-center justify-between border-b border-neutral-800 pb-2">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                Nmap Executable Configuration
              </h2>
            </div>

            <button
              type="button"
              onClick={() => testNmapBinary(nmapPath)}
              disabled={isDetecting}
              className="flex items-center gap-1.5 px-2.5 py-1 text-xs font-mono text-cyan-400 bg-neutral-800 hover:bg-neutral-700 rounded border border-neutral-700 transition-colors cursor-pointer"
            >
              <RefreshCw className={`w-3.5 h-3.5 ${isDetecting ? 'animate-spin' : ''}`} />
              <span>{isDetecting ? 'Detecting...' : 'Auto-Detect / Verify'}</span>
            </button>
          </div>

          {/* Live Status Card */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-neutral-500">NMAP STATUS:</span>
              {detectedStatus?.installed ? (
                <span className="text-emerald-400 font-semibold flex items-center gap-1.5">
                  <CheckCircle2 className="w-4 h-4" />
                  <span>INSTALLED & OPERATIONAL</span>
                </span>
              ) : (
                <span className="text-rose-400 font-semibold flex items-center gap-1.5">
                  <AlertCircle className="w-4 h-4" />
                  <span>NOT INSTALLED / NOT FOUND</span>
                </span>
              )}
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-500">DETECTED VERSION:</span>
              <span className="text-neutral-200">{detectedStatus?.version || 'N/A'}</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="text-neutral-500">RESOLVED PATH:</span>
              <span className="text-neutral-300 truncate max-w-[320px]">{detectedStatus?.path || nmapPath}</span>
            </div>

            {detectedStatus?.error && (
              <div className="p-2 bg-rose-950/40 border border-rose-900/60 rounded text-[11px] text-rose-300">
                {detectedStatus.error}
              </div>
            )}
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
              Configured Nmap Executable Path
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                value={nmapPath}
                onChange={(e) => setNmapPath(e.target.value)}
                placeholder="C:\Program Files\Nmap\nmap.exe or /usr/bin/nmap"
                className="flex-1 px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
              />
              <button
                type="button"
                onClick={() => testNmapBinary(nmapPath)}
                className="px-3 py-2 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono rounded border border-neutral-700 transition-colors"
              >
                Test Path
              </button>
            </div>

            {/* Windows Common Path Suggestions */}
            <div className="mt-2 text-[11px] font-mono text-neutral-400 flex flex-wrap items-center gap-1.5">
              <span className="text-neutral-500">Common Windows paths:</span>
              <button
                type="button"
                onClick={() => {
                  setNmapPath('C:\\Program Files\\Nmap\\nmap.exe');
                  testNmapBinary('C:\\Program Files\\Nmap\\nmap.exe');
                }}
                className="text-cyan-400 hover:underline bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800"
              >
                C:\Program Files\Nmap\nmap.exe
              </button>
              <button
                type="button"
                onClick={() => {
                  setNmapPath('C:\\Program Files (x86)\\Nmap\\nmap.exe');
                  testNmapBinary('C:\\Program Files (x86)\\Nmap\\nmap.exe');
                }}
                className="text-cyan-400 hover:underline bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800"
              >
                C:\Program Files (x86)\Nmap\nmap.exe
              </button>
              <button
                type="button"
                onClick={() => {
                  setNmapPath('nmap');
                  testNmapBinary('nmap');
                }}
                className="text-cyan-400 hover:underline bg-neutral-950 px-1.5 py-0.5 rounded border border-neutral-800"
              >
                System PATH (nmap)
              </button>
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
              SQLite Database Storage File
            </label>
            <input
              type="text"
              value={databasePath}
              onChange={(e) => setDatabasePath(e.target.value)}
              placeholder="~/.netscope/netscope.db"
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
            />
          </div>
        </div>

        {/* Scan & Monitoring Defaults */}
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <Clock className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
              Scan & Monitoring Defaults
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                Default Scan Profile
              </label>
              <select
                value={defaultProfile}
                onChange={(e) => setDefaultProfile(e.target.value as ScanProfileId)}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
              >
                <option value="common-services">Common Services (Top 100)</option>
                <option value="service-detection">Service & Version Detection (-sV)</option>
                <option value="host-discovery">Host Discovery (Ping Sweep)</option>
                <option value="custom-authorized">Custom Authorized Scan</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                Default Sweep Interval (Seconds)
              </label>
              <input
                type="number"
                min="30"
                max="86400"
                value={defaultInterval}
                onChange={(e) => setDefaultInterval(Number(e.target.value))}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
              />
            </div>
          </div>

          <div>
            <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
              Authorized Subnet Whitelist (Comma-separated CIDRs)
            </label>
            <input
              type="text"
              value={allowedSubnetsStr}
              onChange={(e) => setAllowedSubnetsStr(e.target.value)}
              placeholder="192.168.0.0/16, 10.0.0.0/8, 172.16.0.0/12"
              className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
            />
            <span className="text-[11px] text-neutral-500 font-mono mt-1 block">
              Protective boundary preventing accidental sweeps beyond authorized subnets.
            </span>
          </div>
        </div>

        {/* AI Provider Settings */}
        <div className="bg-neutral-900 border border-neutral-800 rounded p-4 space-y-4">
          <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
            <Key className="w-4 h-4 text-cyan-400" />
            <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
              AI Assessment Provider (Prepared for Phase 5)
            </h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                Active Provider
              </label>
              <select
                value={aiProvider}
                onChange={(e) => setAiProvider(e.target.value as 'gemini' | 'deepseek')}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
              >
                <option value="gemini">Google Gemini (gemini-2.5-flash)</option>
                <option value="deepseek">DeepSeek (deepseek-chat)</option>
              </select>
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                {aiProvider === 'gemini' ? 'Gemini API Key' : 'DeepSeek API Key'}
              </label>
              <input
                type="password"
                value={aiProvider === 'gemini' ? geminiApiKey : deepseekApiKey}
                onChange={(e) =>
                  aiProvider === 'gemini'
                    ? setGeminiApiKey(e.target.value)
                    : setDeepseekApiKey(e.target.value)
                }
                placeholder="Enter API key to store in local desktop vault..."
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-200 font-mono"
              />
              <span className="text-[11px] text-neutral-500 font-mono mt-1 block">
                Never committed to git; retained exclusively on local machine.
              </span>
            </div>
          </div>

          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-400 flex items-start gap-2">
            <Shield className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <span>
              The AI layer only receives normalized JSON summaries. It is strictly air-gapped from direct process execution and cannot run shell commands or fire network packets.
            </span>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between pt-2">
          <button
            type="button"
            onClick={handleResetFactory}
            className="flex items-center gap-1.5 px-4 py-2 border border-neutral-800 hover:bg-neutral-800 text-neutral-400 hover:text-neutral-200 text-xs font-mono rounded transition-colors cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset to Sample Data</span>
          </button>

          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="text-emerald-400 text-xs font-mono flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>Settings saved successfully.</span>
              </span>
            )}

            <button
              type="submit"
              className="flex items-center gap-2 px-5 py-2 bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-bold text-xs rounded transition-colors shadow-xs cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>Save Configuration</span>
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
