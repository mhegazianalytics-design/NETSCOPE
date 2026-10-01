import React, { useState } from 'react';
import {
  History,
  GitCompare,
  Server,
  Layers,
  Calendar,
  ExternalLink,
  ShieldAlert,
} from 'lucide-react';
import { Host, Port, Scan, ScanChange } from '../../types';
import { Modal } from '../../components/common/Modal';

interface HistoryPageProps {
  scans: Scan[];
  hosts: Host[];
  ports: Port[];
  changes: ScanChange[];
}

export const HistoryPage: React.FC<HistoryPageProps> = ({
  scans,
  hosts,
  ports,
  changes,
}) => {
  const [selectedScan, setSelectedScan] = useState<Scan | null>(null);
  const [isCompareModalOpen, setIsCompareModalOpen] = useState(false);
  const [baselineScanId, setBaselineScanId] = useState<string>(scans[1]?.id || scans[0]?.id || '');
  const [currentScanId, setCurrentScanId] = useState<string>(scans[0]?.id || '');

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  const getScanChanges = (scanId: string) => {
    return changes.filter((c) => c.scanId === scanId);
  };

  const baselineScan = scans.find((s) => s.id === baselineScanId);
  const comparisonScan = scans.find((s) => s.id === currentScanId);
  const diffChanges = comparisonScan ? getScanChanges(comparisonScan.id) : [];

  return (
    <div className="space-y-6">
      {/* Title & Actions */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-100">
            Scan History & Baseline Audits
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Complete local repository of executed reconnaissance sweeps, raw outputs, and change tracking.
          </p>
        </div>

        {scans.length >= 2 && (
          <button
            onClick={() => setIsCompareModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-cyan-400 border border-neutral-700 rounded text-xs font-mono transition-colors"
          >
            <GitCompare className="w-4 h-4" />
            <span>Compare Two Scans</span>
          </button>
        )}
      </div>

      {/* Scans Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs font-mono">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 bg-neutral-950/40">
                <th className="px-4 py-3">SCAN DATE / TIME</th>
                <th className="px-4 py-3">TARGET</th>
                <th className="px-4 py-3">PROFILE</th>
                <th className="px-4 py-3">HOSTS</th>
                <th className="px-4 py-3">OPEN PORTS</th>
                <th className="px-4 py-3">DURATION</th>
                <th className="px-4 py-3">CHANGES</th>
                <th className="px-4 py-3">STATUS</th>
                <th className="px-4 py-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60">
              {scans.length === 0 ? (
                <tr>
                  <td colSpan={9} className="p-8 text-center text-neutral-500">
                    No historical scans recorded yet.
                  </td>
                </tr>
              ) : (
                scans.map((scan) => {
                  const scanChangesList = getScanChanges(scan.id);
                  return (
                    <tr
                      key={scan.id}
                      onClick={() => setSelectedScan(scan)}
                      className="hover:bg-neutral-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 text-neutral-200 flex items-center gap-2">
                        <Calendar className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{formatDate(scan.startedAt)}</span>
                      </td>

                      <td className="px-4 py-3 font-semibold text-neutral-100">
                        {scan.target}
                      </td>

                      <td className="px-4 py-3 text-neutral-400">
                        {scan.profileName}
                      </td>

                      <td className="px-4 py-3 tabular-nums text-neutral-300">
                        {scan.hostsDiscovered}
                      </td>

                      <td className="px-4 py-3 tabular-nums text-neutral-300">
                        {scan.openPortsDiscovered}
                      </td>

                      <td className="px-4 py-3 tabular-nums text-neutral-400">
                        {scan.durationSeconds ? `${scan.durationSeconds}s` : '—'}
                      </td>

                      <td className="px-4 py-3 tabular-nums">
                        {scanChangesList.length > 0 ? (
                          <span className="text-amber-400 font-semibold">
                            {scanChangesList.length} Changed
                          </span>
                        ) : (
                          <span className="text-neutral-500">0</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span className="text-emerald-400">Completed</span>
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedScan(scan);
                          }}
                          className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] transition-colors inline-flex items-center gap-1"
                        >
                          <span>Review</span>
                          <ExternalLink className="w-3 h-3 text-neutral-500" />
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Scan Details Modal */}
      {selectedScan && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedScan(null)}
          title={`Scan Inspection: ${selectedScan.id}`}
          subtitle={`Target: ${selectedScan.target} · ${formatDate(selectedScan.startedAt)}`}
          maxWidth="2xl"
        >
          <div className="space-y-5">
            {/* Metric Summary */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs">
              <div>
                <span className="text-neutral-500 block text-[11px]">DISCOVERED HOSTS</span>
                <span className="text-neutral-200 font-semibold text-sm">
                  {selectedScan.hostsDiscovered}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px]">OPEN PORTS</span>
                <span className="text-neutral-200 font-semibold text-sm">
                  {selectedScan.openPortsDiscovered}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px]">DURATION</span>
                <span className="text-neutral-300 font-semibold text-sm">
                  {selectedScan.durationSeconds}s
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px]">PROFILE</span>
                <span className="text-neutral-300 truncate block">
                  {selectedScan.profileName}
                </span>
              </div>
            </div>

            {/* Changes recorded in this scan */}
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-neutral-300 mb-2">
                <ShieldAlert className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold uppercase tracking-wider">
                  Baseline Drift Detected in this Run
                </span>
              </div>

              <div className="border border-neutral-800 rounded divide-y divide-neutral-800/60 font-mono text-xs max-h-48 overflow-y-auto">
                {getScanChanges(selectedScan.id).length === 0 ? (
                  <div className="p-4 text-center text-neutral-500 italic">
                    No state changes or port deviations identified against previous baseline.
                  </div>
                ) : (
                  getScanChanges(selectedScan.id).map((change) => (
                    <div key={change.id} className="p-2.5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-semibold">{change.changeType}</span>
                          <span className="text-neutral-400">Host: {change.hostIp}</span>
                          {change.port && (
                            <span className="text-neutral-500">Port {change.port}</span>
                          )}
                        </div>
                        <div className="text-neutral-300">
                          {change.previousValue && (
                            <span className="text-neutral-500 line-through mr-2">
                              {change.previousValue}
                            </span>
                          )}
                          <span className="text-neutral-100">{change.currentValue}</span>
                        </div>
                      </div>
                      <span className="text-[11px] text-neutral-500">
                        {new Date(change.timestamp).toLocaleTimeString()}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* XML Path */}
            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs space-y-1">
              <span className="text-neutral-500 text-[11px] block">
                MACHINE-READABLE NMAP XML ARTIFACT PATH
              </span>
              <span className="text-neutral-300">
                {selectedScan.rawOutputPath || `/var/lib/netscope/scans/${selectedScan.id}.xml`}
              </span>
            </div>
          </div>
        </Modal>
      )}

      {/* Compare Scans Modal */}
      {isCompareModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCompareModalOpen(false)}
          title="Compare Scans & Detect Baseline Drift"
          subtitle="Compare two scans to audit newly opened ports, closed ports, and service changes."
          maxWidth="2xl"
        >
          <div className="space-y-4 font-mono text-xs">
            {/* Scan Selectors */}
            <div className="grid grid-cols-2 gap-4 p-3 bg-neutral-950 border border-neutral-800 rounded">
              <div>
                <label className="block text-neutral-400 mb-1 text-[11px] uppercase">
                  Baseline (Previous Scan)
                </label>
                <select
                  value={baselineScanId}
                  onChange={(e) => setBaselineScanId(e.target.value)}
                  className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-200"
                >
                  {scans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} ({s.target} · {formatDate(s.startedAt)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-neutral-400 mb-1 text-[11px] uppercase">
                  Current (Comparison Scan)
                </label>
                <select
                  value={currentScanId}
                  onChange={(e) => setCurrentScanId(e.target.value)}
                  className="w-full p-2 bg-neutral-900 border border-neutral-700 rounded text-neutral-200"
                >
                  {scans.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.id} ({s.target} · {formatDate(s.startedAt)})
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {/* Comparison Results */}
            <div className="border border-neutral-800 rounded overflow-hidden">
              <div className="p-3 bg-neutral-950 border-b border-neutral-800 font-semibold text-neutral-200 flex items-center justify-between">
                <span>DETECTED DELTAS & DEVIATIONS</span>
                <span className="text-amber-400">{diffChanges.length} Differences</span>
              </div>

              <div className="divide-y divide-neutral-800/70 max-h-64 overflow-y-auto">
                {diffChanges.length === 0 ? (
                  <div className="p-6 text-center text-neutral-500 italic">
                    No discrepancies detected between selected scans.
                  </div>
                ) : (
                  diffChanges.map((change) => (
                    <div key={change.id} className="p-3 space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-amber-400">{change.changeType}</span>
                        <span className="text-neutral-500">·</span>
                        <span className="text-neutral-200">{change.hostIp}</span>
                        {change.port && (
                          <>
                            <span className="text-neutral-500">·</span>
                            <span className="text-neutral-400">Port {change.port}/{change.protocol}</span>
                          </>
                        )}
                      </div>

                      <div className="grid grid-cols-2 gap-2 text-xs pt-1">
                        <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                          <span className="text-neutral-500 block text-[10px]">BASELINE VALUE</span>
                          <span className="text-neutral-400">{change.previousValue || 'None / Not present'}</span>
                        </div>
                        <div className="p-2 bg-neutral-950 rounded border border-neutral-800">
                          <span className="text-neutral-500 block text-[10px]">CURRENT VALUE</span>
                          <span className="text-neutral-100 font-semibold">{change.currentValue}</span>
                        </div>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
