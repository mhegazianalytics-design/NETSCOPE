import React, { useState } from 'react';
import {
  Network,
  Search,
  CheckCircle2,
  BookmarkCheck,
  BookmarkPlus,
  ShieldCheck,
  Server,
  Layers,
} from 'lucide-react';
import { Port, PortWatchlistItem } from '../../types';
import { db } from '../../lib/database/mockStorage';

interface PortsPageProps {
  ports: Port[];
  watchlist: PortWatchlistItem[];
}

export const PortsPage: React.FC<PortsPageProps> = ({ ports, watchlist }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [protocolFilter, setProtocolFilter] = useState<'all' | 'tcp' | 'udp'>('all');
  const [watchlistOnly, setWatchlistOnly] = useState(false);

  const watchlistPortNumbers = new Set(
    watchlist.filter((item) => item.enabled).map((item) => item.port)
  );

  // Group ports by port number + protocol
  const portGroups = React.useMemo(() => {
    const map = new Map<
      string,
      {
        port: number;
        protocol: 'tcp' | 'udp';
        service: string;
        products: Set<string>;
        hosts: { hostIp: string; hostId: string; version?: string }[];
        isWatched: boolean;
      }
    >();

    for (const p of ports) {
      if (p.state !== 'open') continue;
      const key = `${p.port}/${p.protocol}`;
      if (!map.has(key)) {
        map.set(key, {
          port: p.port,
          protocol: p.protocol,
          service: p.service,
          products: new Set(),
          hosts: [],
          isWatched: watchlistPortNumbers.has(p.port),
        });
      }

      const grp = map.get(key)!;
      if (p.product) grp.products.add(p.product);
      grp.hosts.push({
        hostIp: p.hostIp,
        hostId: p.hostId,
        version: p.version,
      });
    }

    return Array.from(map.values()).sort((a, b) => a.port - b.port);
  }, [ports, watchlistPortNumbers]);

  const filteredGroups = portGroups.filter((g) => {
    const matchesSearch =
      g.port.toString().includes(searchTerm) ||
      g.service.toLowerCase().includes(searchTerm.toLowerCase()) ||
      g.hosts.some((h) => h.hostIp.includes(searchTerm));

    const matchesProtocol = protocolFilter === 'all' || g.protocol === protocolFilter;
    const matchesWatchlist = !watchlistOnly || g.isWatched;

    return matchesSearch && matchesProtocol && matchesWatchlist;
  });

  const handleToggleWatchlist = (portNum: number, serviceName: string) => {
    const existing = watchlist.find((w) => w.port === portNum);
    if (existing) {
      db.toggleWatchlistPort(existing.id);
    } else {
      db.addWatchlistPort({
        port: portNum,
        protocol: 'tcp',
        serviceName,
        description: `Monitored ${serviceName} listener`,
        enabled: true,
        riskNote: 'Custom operator monitored port.',
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Title & Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-neutral-100">
            Open Network Ports ({portGroups.length} Active Ports)
          </h1>
          <p className="text-xs text-neutral-400 mt-1">
            Aggregated network listener matrix across all responsive inventory hosts.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-neutral-500 absolute left-3 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search port, service, IP..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-8 pr-3 py-1.5 bg-neutral-900 border border-neutral-700 rounded text-xs text-neutral-200 placeholder:text-neutral-500 focus:outline-hidden focus:border-cyan-500 font-mono w-56"
            />
          </div>

          <div className="flex items-center bg-neutral-900 border border-neutral-800 rounded p-0.5 text-xs font-mono">
            <button
              onClick={() => setProtocolFilter('all')}
              className={`px-2.5 py-1 rounded transition-colors ${
                protocolFilter === 'all'
                  ? 'bg-neutral-800 text-neutral-100'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              All
            </button>
            <button
              onClick={() => setProtocolFilter('tcp')}
              className={`px-2.5 py-1 rounded transition-colors ${
                protocolFilter === 'tcp'
                  ? 'bg-neutral-800 text-cyan-400'
                  : 'text-neutral-400 hover:text-neutral-200'
              }`}
            >
              TCP
            </button>
          </div>

          <button
            onClick={() => setWatchlistOnly(!watchlistOnly)}
            className={`px-3 py-1.5 text-xs font-mono rounded border transition-colors flex items-center gap-1.5 ${
              watchlistOnly
                ? 'bg-cyan-950/80 border-cyan-500 text-cyan-300'
                : 'bg-neutral-900 border-neutral-800 text-neutral-400 hover:border-neutral-700'
            }`}
          >
            <BookmarkCheck className="w-3.5 h-3.5" />
            <span>Watchlist Only</span>
          </button>
        </div>
      </div>

      {/* Ports Matrix Table */}
      <div className="bg-neutral-900 border border-neutral-800 rounded overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr className="border-b border-neutral-800 text-neutral-400 font-mono bg-neutral-950/40">
                <th className="px-4 py-3">PORT / PROTO</th>
                <th className="px-4 py-3">SERVICE NAME</th>
                <th className="px-4 py-3">DETECTED PRODUCTS</th>
                <th className="px-4 py-3">EXPOSED HOSTS</th>
                <th className="px-4 py-3">WATCHLIST</th>
                <th className="px-4 py-3 text-right">WATCHLIST ACTION</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-neutral-800/60 font-mono">
              {filteredGroups.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-neutral-500">
                    No ports matching your active search or filters.
                  </td>
                </tr>
              ) : (
                filteredGroups.map((grp) => {
                  const isWatched = watchlistPortNumbers.has(grp.port);
                  return (
                    <tr key={`${grp.port}-${grp.protocol}`} className="hover:bg-neutral-800/30">
                      {/* Port Number & Protocol */}
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-2">
                          <Network className="w-4 h-4 text-cyan-400" />
                          <span className="font-semibold text-neutral-100 text-sm">
                            {grp.port}
                          </span>
                          <span className="text-neutral-500 text-xs">/{grp.protocol}</span>
                        </div>
                      </td>

                      {/* Service Name */}
                      <td className="px-4 py-3 text-neutral-200 font-medium">
                        {grp.service}
                      </td>

                      {/* Products */}
                      <td className="px-4 py-3 text-neutral-400">
                        {grp.products.size > 0 ? (
                          Array.from(grp.products).join(', ')
                        ) : (
                          <span className="text-neutral-600">—</span>
                        )}
                      </td>

                      {/* Exposed Hosts Count & Host IPs */}
                      <td className="px-4 py-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-1.5 text-neutral-300">
                            <Server className="w-3 h-3 text-neutral-500" />
                            <span>{grp.hosts.length} Host{grp.hosts.length > 1 ? 's' : ''}</span>
                          </div>
                          <div className="text-[11px] text-neutral-500 flex flex-wrap gap-1">
                            {grp.hosts.map((h) => (
                              <span key={h.hostIp} className="text-neutral-400">
                                {h.hostIp}
                              </span>
                            ))}
                          </div>
                        </div>
                      </td>

                      {/* Watchlist status */}
                      <td className="px-4 py-3">
                        {isWatched ? (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Monitored</span>
                          </span>
                        ) : (
                          <span className="text-neutral-500">Unmonitored</span>
                        )}
                      </td>

                      {/* Action */}
                      <td className="px-4 py-3 text-right">
                        <button
                          onClick={() => handleToggleWatchlist(grp.port, grp.service)}
                          className={`px-2.5 py-1 text-[11px] font-mono rounded border transition-colors inline-flex items-center gap-1 ${
                            isWatched
                              ? 'border-neutral-700 bg-neutral-800 text-neutral-300 hover:bg-neutral-700'
                              : 'border-cyan-600/80 bg-cyan-950/60 text-cyan-300 hover:bg-cyan-900/60'
                          }`}
                        >
                          {isWatched ? (
                            <>
                              <BookmarkCheck className="w-3 h-3 text-emerald-400" />
                              <span>Remove</span>
                            </>
                          ) : (
                            <>
                              <BookmarkPlus className="w-3 h-3 text-cyan-400" />
                              <span>Add to Watch</span>
                            </>
                          )}
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
    </div>
  );
};
