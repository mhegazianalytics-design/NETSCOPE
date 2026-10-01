import React, { useState } from 'react';
import {
  Search,
  Server,
  Network,
  Clock,
  ExternalLink,
  Shield,
  Layers,
  CheckCircle2,
  XCircle,
} from 'lucide-react';
import { Host, Port, ScanChange } from '../../types';
import { Modal } from '../../components/common/Modal';

interface HostsPageProps {
  hosts: Host[];
  ports: Port[];
  changes: ScanChange[];
}

export const HostsPage: React.FC<HostsPageProps> = ({ hosts, ports, changes }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'up' | 'down'>('all');
  const [selectedHost, setSelectedHost] = useState<Host | null>(null);

  // Filter hosts
  const filteredHosts = hosts.filter((h) => {
    const matchesSearch =
      h.ip.includes(searchTerm) ||
      (h.hostname && h.hostname.toLowerCase().includes(searchTerm.toLowerCase())) ||
      (h.vendor && h.vendor.toLowerCase().includes(searchTerm.toLowerCase()));

    const matchesStatus = statusFilter === 'all' || h.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const getHostPorts = (hostIp: string) => {
    return ports.filter((p) => p.hostIp === hostIp && p.state === 'open');
  };

  const getHostChanges = (hostIp: string) => {
    return changes.filter((c) => c.hostIp === hostIp);
  };

  const formatDate = (dateStr: string) => {
    try {
      const d = new Date(dateStr);
      return d.toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="space-y-6">
      {/* Page Title & Search Bar */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-100">
            Discovered Hosts ({hosts.length})
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Inventoried network endpoints identified across completed baseline reconnaissance sweeps.
          </p>
        </div>

        {/* Search & Status Filters */}
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Filter by IP, hostname, vendor..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-hidden focus:border-cyan-500 font-mono w-64"
            />
          </div>

          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setStatusFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === 'all'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setStatusFilter('up')}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === 'up'
                  ? 'bg-neutral-800 text-emerald-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Online
            </button>
            <button
              onClick={() => setStatusFilter('down')}
              className={`px-2.5 py-1 rounded transition-colors ${
                statusFilter === 'down'
                  ? 'bg-neutral-800 text-rose-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              Offline
            </button>
          </div>
        </div>
      </div>

      {/* Hosts Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 font-mono bg-neutral-950/40">
                <th className="px-4 py-3">IP ADDRESS</th>
                <th className="px-4 py-3">HOSTNAME</th>
                <th className="px-4 py-3">MAC / HARDWARE VENDOR</th>
                <th className="px-4 py-3">STATUS</th>
                <th className="px-4 py-3">OPEN PORTS</th>
                <th className="px-4 py-3">FIRST SEEN</th>
                <th className="px-4 py-3">LAST SEEN</th>
                <th className="px-4 py-3 text-right">ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {filteredHosts.length === 0 ? (
                <tr>
                  <td colSpan={8} className="p-8 text-center text-neutral-500">
                    No hosts found matching your criteria.
                  </td>
                </tr>
              ) : (
                filteredHosts.map((host) => {
                  const hostPorts = getHostPorts(host.ip);
                  return (
                    <tr
                      key={host.id}
                      onClick={() => setSelectedHost(host)}
                      className="hover:bg-neutral-800/40 cursor-pointer transition-colors"
                    >
                      <td className="px-4 py-3 font-semibold text-neutral-100 flex items-center gap-2">
                        <Server className="w-3.5 h-3.5 text-neutral-500" />
                        <span>{host.ip}</span>
                      </td>

                      <td className="px-4 py-3 text-neutral-300">
                        {host.hostname || <span className="text-neutral-600">—</span>}
                      </td>

                      <td className="px-4 py-3 text-neutral-400">
                        {host.mac ? (
                          <div>
                            <span className="text-neutral-300">{host.mac}</span>
                            {host.vendor && (
                              <span className="text-neutral-500 text-[11px] block">
                                {host.vendor}
                              </span>
                            )}
                          </div>
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      <td className="px-4 py-3">
                        <span
                          className={`inline-flex items-center gap-1 ${
                            host.status === 'up' ? 'text-emerald-400' : 'text-rose-400'
                          }`}
                        >
                          {host.status === 'up' ? (
                            <CheckCircle2 className="w-3 h-3" />
                          ) : (
                            <XCircle className="w-3 h-3" />
                          )}
                          <span>{host.status.toUpperCase()}</span>
                        </span>
                      </td>

                      <td className="px-4 py-3 tabular-nums">
                        <div className="flex items-center gap-1.5 text-neutral-300">
                          <Network className="w-3.5 h-3.5 text-neutral-500" />
                          <span>{hostPorts.length}</span>
                        </div>
                      </td>

                      <td className="px-4 py-3 text-neutral-500 tabular-nums">
                        {formatDate(host.firstSeen)}
                      </td>

                      <td className="px-4 py-3 text-neutral-400 tabular-nums">
                        {formatDate(host.lastSeen)}
                      </td>

                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedHost(host);
                          }}
                          className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-[11px] font-mono transition-colors inline-flex items-center gap-1"
                        >
                          <span>Inspect</span>
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

      {/* Host Details Inspection Modal */}
      {selectedHost && (
        <Modal
          isOpen={true}
          onClose={() => setSelectedHost(null)}
          title={`Host Details: ${selectedHost.ip}`}
          subtitle={selectedHost.hostname || 'No PTR hostname configured'}
          maxWidth="2xl"
        >
          <div className="space-y-5">
            {/* Host Identity Overview */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3 p-3 bg-neutral-950 border border-neutral-800 rounded font-mono text-xs">
              <div>
                <span className="text-neutral-500 block text-[11px]">IP ADDRESS</span>
                <span className="text-neutral-200 font-semibold">{selectedHost.ip}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px]">STATUS</span>
                <span className={selectedHost.status === 'up' ? 'text-emerald-400' : 'text-rose-400'}>
                  {selectedHost.status.toUpperCase()}
                </span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px]">HARDWARE MAC</span>
                <span className="text-neutral-300">{selectedHost.mac || 'N/A'}</span>
              </div>
              <div>
                <span className="text-neutral-500 block text-[11px]">VENDOR</span>
                <span className="text-neutral-300">{selectedHost.vendor || 'Unknown'}</span>
              </div>
            </div>

            {selectedHost.osMatch && (
              <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs font-mono flex items-center justify-between">
                <div>
                  <span className="text-neutral-500 text-[11px] block">OS GUESS / FINGERPRINT</span>
                  <span className="text-neutral-200">{selectedHost.osMatch}</span>
                </div>
                {selectedHost.osAccuracy && (
                  <span className="text-neutral-400 text-xs">{selectedHost.osAccuracy}% accuracy</span>
                )}
              </div>
            )}

            {/* Open Ports Table */}
            <div>
              <div className="flex items-center justify-between mb-2">
                <div className="flex items-center gap-1.5 font-mono text-xs text-neutral-300">
                  <Layers className="w-3.5 h-3.5 text-cyan-400" />
                  <span className="font-semibold uppercase tracking-wider">
                    Open Ports & Verified Services
                  </span>
                </div>
                <span className="text-xs font-mono text-neutral-500">
                  {getHostPorts(selectedHost.ip).length} Active Listeners
                </span>
              </div>

              <div className="border border-neutral-800 rounded overflow-hidden">
                <table className="w-full text-left text-xs font-mono">
                  <thead>
                    <tr className="border-b border-neutral-800 text-neutral-400 bg-neutral-950/70">
                      <th className="px-3 py-2">PORT</th>
                      <th className="px-3 py-2">STATE</th>
                      <th className="px-3 py-2">SERVICE</th>
                      <th className="px-3 py-2">PRODUCT / VERSION</th>
                      <th className="px-3 py-2">LAST SEEN</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-neutral-800/60">
                    {getHostPorts(selectedHost.ip).length === 0 ? (
                      <tr>
                        <td colSpan={5} className="p-4 text-center text-neutral-500 italic">
                          No open ports detected on this host.
                        </td>
                      </tr>
                    ) : (
                      getHostPorts(selectedHost.ip).map((port) => (
                        <tr key={port.id} className="hover:bg-neutral-800/30">
                          <td className="px-3 py-2 font-semibold text-cyan-300">
                            {port.port}/{port.protocol}
                          </td>
                          <td className="px-3 py-2 text-emerald-400">{port.state}</td>
                          <td className="px-3 py-2 text-neutral-200">{port.service}</td>
                          <td className="px-3 py-2 text-neutral-400">
                            {[port.product, port.version].filter(Boolean).join(' ') || '—'}
                          </td>
                          <td className="px-3 py-2 text-neutral-500">{formatDate(port.lastSeen)}</td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Change History for Host */}
            <div>
              <div className="flex items-center gap-1.5 font-mono text-xs text-neutral-300 mb-2">
                <Clock className="w-3.5 h-3.5 text-amber-400" />
                <span className="font-semibold uppercase tracking-wider">
                  Baseline Drift & Change History
                </span>
              </div>

              <div className="border border-neutral-800 rounded divide-y divide-neutral-800/60 font-mono text-xs max-h-48 overflow-y-auto">
                {getHostChanges(selectedHost.ip).length === 0 ? (
                  <div className="p-4 text-center text-neutral-500 italic">
                    No change events recorded for this host.
                  </div>
                ) : (
                  getHostChanges(selectedHost.ip).map((change) => (
                    <div key={change.id} className="p-2.5 flex items-center justify-between">
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="text-amber-400 font-semibold">{change.changeType}</span>
                          {change.port && (
                            <span className="text-neutral-400">Port {change.port}</span>
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
                        {formatDate(change.timestamp)}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </div>

            {/* Security Footnote */}
            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-400 flex items-start gap-2">
              <Shield className="w-4 h-4 text-neutral-500 shrink-0 mt-0.5" />
              <span>
                Verified evidence collected directly from socket banners and probe responses.
                No unverified exploit speculation is shown.
              </span>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
};
