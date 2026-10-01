import React, { useEffect, useState } from 'react';
import { Database, ShieldCheck, Terminal, Cpu } from 'lucide-react';
import { desktopBridge, DatabaseStatus } from '../../desktop/bridge';
import { NmapStatus } from '../../types/nmap';
import { db } from '../../lib/database/mockStorage';

interface TopBarProps {
  onNavigateToSettings?: () => void;
}

export const TopBar: React.FC<TopBarProps> = ({ onNavigateToSettings }) => {
  const [nmapStatus, setNmapStatus] = useState<NmapStatus | null>(null);
  const [dbStatus, setDbStatus] = useState<DatabaseStatus | null>(null);
  const [settings, setSettings] = useState(db.getSettings());

  const checkStatus = () => {
    const s = db.getSettings();
    setSettings(s);
    desktopBridge.getNmapStatus(s.nmapPath).then(setNmapStatus);
    desktopBridge.getDatabaseStatus().then(setDbStatus);
  };

  useEffect(() => {
    checkStatus();
    return db.subscribe(checkStatus);
  }, []);

  return (
    <header className="h-14 border-b border-neutral-800 bg-neutral-900/90 backdrop-blur px-5 flex items-center justify-between z-30 shrink-0">
      {/* Zone 1: Brand & Operating Mode */}
      <div className="flex items-center gap-3">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded bg-neutral-800 border border-neutral-700 flex items-center justify-center text-cyan-400">
            <ShieldCheck className="w-4 h-4" />
          </div>
          <span className="font-semibold text-base tracking-tight text-neutral-100">
            NETSCOPE
          </span>
        </div>

        <div className="h-4 w-px bg-neutral-800" />

        <div className="flex items-center gap-1.5 text-xs text-neutral-400 font-mono">
          <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
          <span className="text-neutral-300 font-medium">LOCAL MODE</span>
          <span className="text-neutral-600">·</span>
          <span>AUTHORIZED ASSESSMENTS ONLY</span>
        </div>
      </div>

      {/* Zone 2: System Status Indicators */}
      <div className="flex items-center gap-4 text-xs font-mono text-neutral-400">
        {/* Nmap Engine Status (Interactive - clicking opens Settings) */}
        <button
          type="button"
          onClick={onNavigateToSettings}
          className="flex items-center gap-1.5 hover:text-neutral-200 transition-colors p-1 rounded hover:bg-neutral-800/60 cursor-pointer"
          title={`Click to configure Nmap in Settings. Binary: ${settings.nmapPath}`}
        >
          <Terminal className="w-3.5 h-3.5 text-neutral-500" />
          <span>Nmap:</span>
          {settings.mockMode ? (
            <span className="text-amber-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
              <span>MOCK</span>
            </span>
          ) : nmapStatus?.installed ? (
            <span className="text-emerald-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
              <span>READY ({nmapStatus.version || 'v7.94'})</span>
            </span>
          ) : (
            <span className="text-rose-400 flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-rose-400" />
              <span>NOT INSTALLED</span>
            </span>
          )}
        </button>

        <span className="text-neutral-700">·</span>

        {/* Database Status */}
        <div className="flex items-center gap-1.5" title={`Path: ${settings.databasePath}`}>
          <Database className="w-3.5 h-3.5 text-neutral-500" />
          <span>DB:</span>
          <span className="text-emerald-400">
            {dbStatus ? dbStatus.engine : 'SQLite Ready'}
          </span>
        </div>

        <span className="text-neutral-700">·</span>

        {/* AI Provider Status */}
        <div className="flex items-center gap-1.5">
          <Cpu className="w-3.5 h-3.5 text-neutral-500" />
          <span>AI:</span>
          <span className="text-neutral-300 capitalize">
            {settings.aiProvider} (Prepared)
          </span>
        </div>
      </div>
    </header>
  );
};
