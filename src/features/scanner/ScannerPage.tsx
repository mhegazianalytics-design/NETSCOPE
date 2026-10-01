import React, { useState, useEffect, useRef } from 'react';
import {
  Play,
  Square,
  RotateCcw,
  CheckCircle2,
  AlertTriangle,
  Info,
  Terminal,
  Activity,
  Layers,
  Clock,
  Check,
} from 'lucide-react';
import { ScanProfileId, PortWatchlistItem, Scan } from '../../types';
import { ScanProcessState, NmapStatus } from '../../types/nmap';
import { SCAN_PROFILES, buildNmapArgs } from '../../lib/nmap/profiles';
import { validateTarget, ValidationResult } from '../../lib/validation/targetValidator';
import { db } from '../../lib/database/mockStorage';
import { desktopBridge } from '../../desktop/bridge';

interface ScannerPageProps {
  onScanCompleted?: () => void;
  onNavigateToSettings?: () => void;
}

export const ScannerPage: React.FC<ScannerPageProps> = ({
  onScanCompleted,
  onNavigateToSettings,
}) => {
  const [targetInput, setTargetInput] = useState('192.168.1.0/24');
  const [validation, setValidation] = useState<ValidationResult>({
    isValid: true,
    normalizedTarget: '192.168.1.0/24',
  });
  const [selectedProfile, setSelectedProfile] = useState<ScanProfileId>('common-services');
  const [watchlist, setWatchlist] = useState<PortWatchlistItem[]>(db.getWatchlist());
  const [selectedPorts, setSelectedPorts] = useState<number[]>([22, 53, 80, 443, 445, 3389, 8080]);
  const [settings, setSettings] = useState(db.getSettings());
  const [nmapStatus, setNmapStatus] = useState<NmapStatus | null>(null);

  // Scanning State
  const [isScanning, setIsScanning] = useState(false);
  const [activeScanId, setActiveScanId] = useState<string | null>(null);
  const [processState, setProcessState] = useState<ScanProcessState>('idle');
  const [statusMessage, setStatusMessage] = useState('Awaiting launch command');
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const [scanOutputLog, setScanOutputLog] = useState<string[]>([]);
  const [lastFinishedScan, setLastFinishedScan] = useState<Scan | null>(null);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    const update = () => {
      const s = db.getSettings();
      setSettings(s);
      setWatchlist(db.getWatchlist());
      desktopBridge.getNmapStatus(s.nmapPath).then(setNmapStatus);
    };

    update();
    return db.subscribe(update);
  }, []);

  const handleTargetChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    setTargetInput(val);
    const res = validateTarget(val);
    setValidation(res);
  };

  const togglePort = (port: number) => {
    if (selectedPorts.includes(port)) {
      setSelectedPorts(selectedPorts.filter((p) => p !== port));
    } else {
      setSelectedPorts([...selectedPorts, port].sort((a, b) => a - b));
    }
  };

  // Safe Argument preview
  const previewArgs = buildNmapArgs({
    target: validation.isValid && validation.normalizedTarget ? validation.normalizedTarget : targetInput,
    profileId: selectedProfile,
    xmlOutputPath: 'data/scans/active/result.xml',
    customPorts: selectedPorts,
  });

  const handleStartScan = async () => {
    if (!validation.isValid || !validation.normalizedTarget) return;

    setIsScanning(true);
    setProcessState('initializing');
    setStatusMessage('Initializing safe reconnaissance process...');
    setElapsedSeconds(0);
    setLastFinishedScan(null);

    const target = validation.normalizedTarget;
    const modeLabel = settings.mockMode ? 'Mock Simulation Mode' : 'Native Local Binary';

    setScanOutputLog([
      `[${new Date().toLocaleTimeString()}] Task scheduled for target: ${target}`,
      `[${new Date().toLocaleTimeString()}] Execution Engine: ${modeLabel}`,
      `[${new Date().toLocaleTimeString()}] Selected Profile: ${SCAN_PROFILES[selectedProfile].name}`,
      `[${new Date().toLocaleTimeString()}] Isolated argv: nmap ${previewArgs.join(' ')}`,
      `[${new Date().toLocaleTimeString()}] Spawning process without shell interpolation...`,
    ]);

    timerRef.current = setInterval(() => {
      setElapsedSeconds((prev) => prev + 1);
    }, 1000);

    try {
      const scanResult = await db.executeScan({
        target,
        profileId: selectedProfile,
        selectedPorts,
        timeoutSeconds: 120,
        onProgress: (msg) => {
          setStatusMessage(msg);
          setScanOutputLog((prev) => [...prev, `[${new Date().toLocaleTimeString()}] ${msg}`]);
        },
        onStateChange: (state) => {
          setProcessState(state);
        },
      });

      setLastFinishedScan(scanResult);
      setProcessState('completed');
      setStatusMessage('Scan completed successfully.');
      setScanOutputLog((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] Scan finalized. Artifact written to ${scanResult.rawOutputPath}`,
        `[${new Date().toLocaleTimeString()}] Discovered: ${scanResult.hostsDiscovered} hosts, ${scanResult.openPortsDiscovered} ports, ${scanResult.changesDetected} baseline changes.`,
      ]);
      onScanCompleted?.();
    } catch (err: any) {
      setProcessState('failed');
      const errMsg = err?.message || 'Scan execution failed.';
      setStatusMessage(`Error: ${errMsg}`);
      setScanOutputLog((prev) => [
        ...prev,
        `[${new Date().toLocaleTimeString()}] ❌ Execution Error: ${errMsg}`,
      ]);
    } finally {
      if (timerRef.current) clearInterval(timerRef.current);
      setIsScanning(false);
      setActiveScanId(null);
    }
  };

  const handleStopScan = async () => {
    setStatusMessage('Terminating scan process safely...');
    setScanOutputLog((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] SIGTERM issued by operator. Halting process...`,
    ]);

    if (activeScanId) {
      await db.stopActiveScan(activeScanId);
    }

    if (timerRef.current) clearInterval(timerRef.current);
    setIsScanning(false);
    setProcessState('stopped');
    setStatusMessage('Scan stopped by operator.');
    setScanOutputLog((prev) => [
      ...prev,
      `[${new Date().toLocaleTimeString()}] Process killed safely. Resources cleaned up.`,
    ]);
  };

  const handleClear = () => {
    setScanOutputLog([]);
    setProcessState('idle');
    setStatusMessage('Awaiting launch command');
    setElapsedSeconds(0);
    setLastFinishedScan(null);
  };

  const getProcessStateDisplay = () => {
    switch (processState) {
      case 'initializing':
        return <span className="text-cyan-400 font-medium">INITIALIZING</span>;
      case 'running':
        return <span className="text-amber-400 font-medium animate-pulse">RUNNING (PID Isolated)</span>;
      case 'parsing':
        return <span className="text-indigo-400 font-medium">PARSING XML</span>;
      case 'completed':
        return <span className="text-emerald-400 font-medium">COMPLETED</span>;
      case 'stopped':
        return <span className="text-amber-400 font-medium">STOPPED</span>;
      case 'failed':
        return <span className="text-rose-400 font-medium">FAILED</span>;
      case 'timeout':
        return <span className="text-rose-400 font-medium">TIMEOUT</span>;
      default:
        return <span className="text-neutral-500 font-medium">IDLE</span>;
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Engine Mode Indicators */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-100">
            Target Scanner
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Perform controlled network host and service reconnaissance using safe argument isolation.
          </p>
        </div>

        {/* Engine and Nmap Status Badges */}
        <div className="flex items-center gap-2 font-mono text-xs">
          <div className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 rounded flex items-center gap-1.5">
            <span className="text-neutral-500">Mode:</span>
            {settings.mockMode ? (
              <span className="text-amber-400 font-semibold">Mock Mode</span>
            ) : (
              <span className="text-cyan-400 font-semibold">Native Nmap</span>
            )}
          </div>

          <button
            type="button"
            onClick={onNavigateToSettings}
            className="px-2.5 py-1 bg-neutral-900 border border-neutral-800 hover:border-neutral-700 rounded flex items-center gap-1.5 transition-colors cursor-pointer"
            title="Configure in Settings"
          >
            <span className="text-neutral-500">Nmap:</span>
            {settings.mockMode ? (
              <span className="text-neutral-300">Mock Ready</span>
            ) : nmapStatus?.installed ? (
              <span className="text-emerald-400">Ready ({nmapStatus.version || 'v7.94'})</span>
            ) : (
              <span className="text-rose-400">Not Installed</span>
            )}
          </button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Target Config, Profile, and Ports */}
        <div className="lg:col-span-2 space-y-5">
          {/* Target Input Box */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded space-y-3">
            <label className="block text-xs font-semibold text-neutral-200 font-mono uppercase tracking-wider">
              Authorized Target Specification
            </label>

            <div className="space-y-1.5">
              <input
                type="text"
                value={targetInput}
                onChange={handleTargetChange}
                placeholder="e.g. 192.168.1.1 or 192.168.1.0/24 or server.internal"
                disabled={isScanning}
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs font-mono text-neutral-100 focus:outline-hidden focus:border-cyan-500 focus:ring-1 focus:ring-cyan-500 transition-colors disabled:opacity-50"
              />

              <div className="flex items-center justify-between text-xs">
                {validation.isValid ? (
                  <div className="flex items-center gap-1.5 text-emerald-400 font-mono">
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>
                      Target format valid ({validation.type?.toUpperCase()}
                      {validation.isPrivateNetwork ? ' · Private/RFC 1918 Scope' : ''})
                    </span>
                  </div>
                ) : (
                  <div className="flex items-center gap-1.5 text-rose-400 font-mono">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>{validation.error}</span>
                  </div>
                )}

                <span className="text-[11px] text-neutral-500 font-mono">
                  Input isolated; no shell expansion
                </span>
              </div>
            </div>
          </div>

          {/* Scan Profile Selection */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded space-y-3">
            <label className="block text-xs font-semibold text-neutral-200 font-mono uppercase tracking-wider">
              Select Scan Profile
            </label>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {(Object.keys(SCAN_PROFILES) as ScanProfileId[]).map((key) => {
                const profile = SCAN_PROFILES[key];
                const isSelected = selectedProfile === key;
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => setSelectedProfile(key)}
                    disabled={isScanning}
                    className={`p-3 text-left rounded border transition-all ${
                      isSelected
                        ? 'bg-neutral-800/90 border-cyan-500/80 shadow-xs'
                        : 'bg-neutral-950/60 border-neutral-800 hover:border-neutral-700'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-semibold text-xs text-neutral-100">
                        {profile.name}
                      </span>
                      <span className="text-[11px] font-mono text-neutral-400">
                        ~{profile.estimatedDuration}
                      </span>
                    </div>
                    <p className="text-xs text-neutral-400 leading-snug">
                      {profile.description}
                    </p>
                    <div className="mt-2 text-[11px] font-mono text-neutral-400 bg-neutral-950 px-2 py-1 rounded">
                      nmap {profile.nmapArgs.join(' ')}
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Port Watchlist / Custom Ports */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <label className="text-xs font-semibold text-neutral-200 font-mono uppercase tracking-wider">
                  Monitored Port Selection
                </label>
                <p className="text-xs text-neutral-400 mt-0.5">
                  Select ports included in Custom Authorized Scan and baseline monitoring.
                </p>
              </div>
              <span className="text-xs font-mono text-cyan-400">
                {selectedPorts.length} Selected
              </span>
            </div>

            <div className="flex flex-wrap gap-2 pt-1">
              {watchlist.map((item) => {
                const isChecked = selectedPorts.includes(item.port);
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => togglePort(item.port)}
                    disabled={isScanning}
                    className={`px-2.5 py-1.5 rounded text-xs font-mono border transition-colors flex items-center gap-1.5 ${
                      isChecked
                        ? 'bg-neutral-800 border-cyan-500 text-cyan-300'
                        : 'bg-neutral-950 border-neutral-800 text-neutral-400 hover:border-neutral-700'
                    }`}
                  >
                    <span className="font-semibold">{item.port}</span>
                    <span className="text-[11px] opacity-75">{item.serviceName}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Safe Argument Inspection Bar */}
          <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs font-mono">
            <div className="text-[11px] text-neutral-500 flex items-center gap-1.5 mb-1">
              <Terminal className="w-3.5 h-3.5 text-neutral-400" />
              <span>ISOLATED COMMAND ARGUMENT ARRAY (VECTOR EXECUTION · NO SHELL)</span>
            </div>
            <div className="text-neutral-300 overflow-x-auto whitespace-nowrap py-1">
              <span className="text-cyan-400">nmap</span>{' '}
              {previewArgs.map((arg, idx) => (
                <span key={idx} className="mr-1.5 text-neutral-300">
                  {arg}
                </span>
              ))}
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-3 pt-2">
            {!isScanning ? (
              <button
                type="button"
                onClick={handleStartScan}
                disabled={!validation.isValid}
                className="flex items-center gap-2 px-5 py-2.5 bg-cyan-600 hover:bg-cyan-500 disabled:bg-neutral-800 disabled:text-neutral-600 text-neutral-950 font-bold text-xs rounded transition-colors shadow-xs cursor-pointer"
              >
                <Play className="w-4 h-4 fill-current" />
                <span>START SCAN</span>
              </button>
            ) : (
              <button
                type="button"
                onClick={handleStopScan}
                className="flex items-center gap-2 px-5 py-2.5 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded transition-colors cursor-pointer"
              >
                <Square className="w-4 h-4 fill-current" />
                <span>STOP SCAN</span>
              </button>
            )}

            <button
              type="button"
              onClick={handleClear}
              disabled={isScanning}
              className="flex items-center gap-1.5 px-4 py-2.5 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs rounded transition-colors disabled:opacity-50 cursor-pointer"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>CLEAR</span>
            </button>
          </div>
        </div>

        {/* Right Col: Live Status & Process Telemetry Log */}
        <div className="space-y-4">
          {/* Live Progress Card */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded space-y-4">
            <h2 className="text-xs font-semibold text-neutral-200 font-mono uppercase tracking-wider">
              Nmap Process Execution
            </h2>

            <div className="space-y-2">
              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-400">Process State:</span>
                <div>{getProcessStateDisplay()}</div>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-400">Elapsed Time:</span>
                <span className="text-neutral-200 tabular-nums">{elapsedSeconds}s</span>
              </div>

              <div className="flex items-center justify-between text-xs font-mono">
                <span className="text-neutral-400">Target Scope:</span>
                <span className="text-neutral-200 font-semibold">{targetInput}</span>
              </div>
            </div>

            {/* Indeterminate or State Progress Indicator */}
            <div className="space-y-1">
              <div className="w-full bg-neutral-950 h-2 rounded overflow-hidden border border-neutral-800 relative">
                {isScanning ? (
                  // Indeterminate pulse animation for real process execution
                  <div className="bg-cyan-500 h-full w-1/3 rounded animate-[shimmer_1.5s_infinite] transition-all" />
                ) : processState === 'completed' ? (
                  <div className="bg-emerald-500 h-full w-full" />
                ) : (
                  <div className="bg-neutral-800 h-full w-0" />
                )}
              </div>
              <div className="flex items-center justify-between text-[11px] font-mono text-neutral-500">
                <span className="truncate max-w-[240px]">{statusMessage}</span>
                <span>{isScanning ? `${elapsedSeconds}s` : processState}</span>
              </div>
            </div>
          </div>

          {/* Post-Scan Result Summary Card (Shown when a scan completes) */}
          {lastFinishedScan && (
            <div className="p-4 bg-neutral-900 border border-emerald-900/60 rounded space-y-3 font-mono text-xs">
              <div className="flex items-center gap-1.5 text-emerald-400 font-semibold">
                <Check className="w-4 h-4" />
                <span>SCAN RUN COMPLETED</span>
              </div>

              <div className="grid grid-cols-3 gap-2 text-center pt-1">
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 block">HOSTS</span>
                  <span className="text-neutral-100 font-bold text-sm">
                    {lastFinishedScan.hostsDiscovered}
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 block">PORTS</span>
                  <span className="text-neutral-100 font-bold text-sm">
                    {lastFinishedScan.openPortsDiscovered}
                  </span>
                </div>
                <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                  <span className="text-[10px] text-neutral-500 block">CHANGES</span>
                  <span className="text-amber-400 font-bold text-sm">
                    {lastFinishedScan.changesDetected}
                  </span>
                </div>
              </div>

              <div className="text-[11px] text-neutral-500 truncate pt-1 border-t border-neutral-800/80">
                Artifact: {lastFinishedScan.rawOutputPath}
              </div>
            </div>
          )}

          {/* Console / Output Log */}
          <div className="bg-neutral-950 border border-neutral-800 rounded flex flex-col h-64 overflow-hidden">
            <div className="px-3 py-2 border-b border-neutral-800 text-[11px] font-mono text-neutral-400 flex items-center justify-between bg-neutral-900/60">
              <span>SCAN RUNNER LOG</span>
              <span className="text-neutral-500">{scanOutputLog.length} lines</span>
            </div>

            <div className="p-3 font-mono text-xs text-neutral-300 space-y-1 overflow-y-auto flex-1 select-text">
              {scanOutputLog.length === 0 ? (
                <div className="text-neutral-600 italic">No output logged yet. Launch a scan to trace execution.</div>
              ) : (
                scanOutputLog.map((line, i) => (
                  <div key={i} className="text-neutral-300 leading-relaxed break-all">
                    {line}
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Defensive Scope Note */}
          <div className="p-3 bg-neutral-900 border border-neutral-800 rounded text-xs text-neutral-400 flex gap-2">
            <Info className="w-4 h-4 text-cyan-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              Safe recon operations only inspect responsive sockets and service headers. No exploit scripts or evasion modules are engaged.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
