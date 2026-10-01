import React from 'react';
import {
  Server,
  Network,
  Activity,
  GitCompare,
  Clock,
  Play,
  ArrowRight,
  ShieldAlert,
  Layers,
  CheckCircle2,
  Bell,
  AlertTriangle,
  Radio,
  Eye,
} from 'lucide-react';
import { Host, MonitoringEngineStatus, MonitoringEvent, MonitoringJob, Port, Scan, ScanChange } from '../../types';
import { StatCard } from '../../components/common/StatCard';
import { NavPage } from '../../components/layout/Sidebar';
import { db } from '../../lib/database/mockStorage';

interface DashboardPageProps {
  hosts: Host[];
  ports: Port[];
  scans: Scan[];
  changes: ScanChange[];
  monitoringJobs: MonitoringJob[];
  monitoringEvents?: MonitoringEvent[];
  engineStatus?: MonitoringEngineStatus | null;
  onNavigate: (page: NavPage) => void;
  onSelectHost?: (host: Host) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({
  hosts,
  ports,
  scans,
  changes,
  monitoringJobs,
  monitoringEvents = [],
  engineStatus,
  onNavigate,
}) => {
  const openPorts = ports.filter((p) => p.state === 'open');
  const distinctServices = new Set(openPorts.map((p) => p.service)).size;
  const activeJobs = monitoringJobs.filter((j) => j.status === 'active');
  const runningJobs = monitoringJobs.filter((j) => j.runtimeState === 'running');
  const lastScan = scans[0];

  // Specific delta counters per requirement 18
  const newPortsCount = changes.filter((c) => c.changeType === 'PORT_OPENED').length;
  const closedPortsCount = changes.filter((c) => c.changeType === 'PORT_CLOSED').length;
  const newHostsCount = changes.filter((c) => c.changeType === 'NEW_HOST').length;
  const removedHostsCount = changes.filter((c) => c.changeType === 'REMOVED_HOST').length;

  const unacknowledgedEvents = monitoringEvents.filter((e) => !e.acknowledgedAt);

  const formatTimeAgo = (dateStr?: string) => {
    if (!dateStr) return 'Never';
    const seconds = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
    if (seconds < 60) return `${Math.max(1, seconds)}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  };

  const getEventBadge = (type: MonitoringEvent['eventType'], severity: MonitoringEvent['severity']) => {
    switch (type) {
      case 'PORT_OPENED':
        return (
          <span className={`font-mono text-[11px] px-1.5 py-0.5 rounded border ${
            severity === 'warning'
              ? 'bg-amber-950/60 text-amber-300 border-amber-800/80 font-bold'
              : 'bg-amber-950/30 text-amber-400 border-amber-900/60'
          }`}>
            PORT_OPENED
          </span>
        );
      case 'PORT_CLOSED':
        return (
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-neutral-900 text-neutral-400 border-neutral-800">
            PORT_CLOSED
          </span>
        );
      case 'NEW_HOST':
        return (
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-emerald-950/40 text-emerald-400 border-emerald-900/60 font-medium">
            NEW_HOST
          </span>
        );
      case 'REMOVED_HOST':
        return (
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-rose-950/40 text-rose-400 border-rose-900/60">
            REMOVED_HOST
          </span>
        );
      case 'SERVICE_CHANGED':
        return (
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-cyan-950/40 text-cyan-400 border-cyan-900/60">
            SERVICE_CHANGED
          </span>
        );
      case 'VERSION_CHANGED':
        return (
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-indigo-950/40 text-indigo-400 border-indigo-900/60">
            VERSION_CHANGED
          </span>
        );
      case 'SCAN_FAILED':
        return (
          <span className="font-mono text-[11px] px-1.5 py-0.5 rounded border bg-rose-950/60 text-rose-300 border-rose-800/80 font-bold">
            SCAN_FAILED
          </span>
        );
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Actions */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-neutral-100">
              Network Reconnaissance Overview
            </h1>
            {runningJobs.length > 0 && (
              <span className="flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-cyan-950/80 border border-cyan-800/80 text-cyan-300 font-mono text-[11px] animate-pulse">
                <Radio className="w-3 h-3 text-cyan-400 animate-spin" />
                <span>{runningJobs.length} Sweep Active</span>
              </span>
            )}
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Continuous posture assessment, local SQLite persistence, and baseline drift monitoring for authorized subnets.
          </p>
        </div>

        <div className="flex items-center gap-3">
          <button
            onClick={() => onNavigate('monitoring')}
            className="flex items-center gap-2 px-3 py-1.5 bg-neutral-900 hover:bg-neutral-800 border border-neutral-700/80 text-neutral-200 font-mono text-xs rounded transition-colors"
          >
            <Activity className="w-3.5 h-3.5 text-cyan-400" />
            <span>Schedules ({activeJobs.length})</span>
          </button>

          <button
            onClick={() => onNavigate('scanner')}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-semibold text-xs rounded transition-colors"
          >
            <Play className="w-3.5 h-3.5 fill-current" />
            <span>Launch Scan</span>
          </button>
        </div>
      </div>

      {/* 6 Key Stat Cards */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        <StatCard
          label="TOTAL HOSTS"
          value={hosts.length}
          subtext={`${hosts.filter((h) => h.status === 'up').length} online`}
          icon={Server}
          accentColor="cyan"
        />
        <StatCard
          label="OPEN PORTS"
          value={openPorts.length}
          subtext={`${distinctServices} distinct services`}
          icon={Network}
          accentColor="emerald"
        />
        <StatCard
          label="ACTIVE JOBS"
          value={activeJobs.length}
          subtext={runningJobs.length > 0 ? `${runningJobs.length} scanning now` : 'Idle / Scheduled'}
          icon={Activity}
          accentColor={runningJobs.length > 0 ? 'cyan' : 'neutral'}
        />
        <StatCard
          label="NEW CHANGES"
          value={changes.length}
          subtext={`${newPortsCount} opened · ${closedPortsCount} closed`}
          icon={GitCompare}
          accentColor={changes.length > 0 ? 'amber' : 'neutral'}
        />
        <StatCard
          label="PENDING ALERTS"
          value={unacknowledgedEvents.length}
          subtext={unacknowledgedEvents.length > 0 ? 'Requires operator review' : 'All acknowledged'}
          icon={Bell}
          accentColor={unacknowledgedEvents.length > 0 ? 'amber' : 'neutral'}
        />
        <StatCard
          label="LAST SCAN"
          value={lastScan ? formatTimeAgo(lastScan.completedAt || lastScan.startedAt) : 'None'}
          subtext={lastScan ? lastScan.target : 'No runs yet'}
          icon={Clock}
          accentColor="neutral"
        />
      </div>

      {/* Requirement 18: Specific Delta Breakdown Summary Bar */}
      <div className="p-3 bg-neutral-900 border border-neutral-800 rounded flex flex-wrap items-center justify-between gap-4 font-mono text-xs">
        <div className="flex items-center gap-6">
          <span className="text-neutral-400 uppercase text-[11px] tracking-wider font-semibold">
            Baseline Drift Matrix:
          </span>
          <span className="text-neutral-300">
            New Hosts: <strong className="text-emerald-400">+{newHostsCount}</strong>
          </span>
          <span className="text-neutral-300">
            Removed Hosts: <strong className="text-rose-400">-{removedHostsCount}</strong>
          </span>
          <span className="text-neutral-300">
            New Ports: <strong className="text-amber-400">+{newPortsCount}</strong>
          </span>
          <span className="text-neutral-300">
            Closed Ports: <strong className="text-neutral-400">-{closedPortsCount}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="text-[11px] text-neutral-500">
            Engine Concurrency Limit: {engineStatus?.maxConcurrency || 2}
          </span>
        </div>
      </div>

      {/* Main Grid: Monitoring Events + Recent Scans & Active Jobs */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Cols: Recent Monitoring Events (Requirement 17 & 18) */}
        <div className="lg:col-span-2 space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Bell className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                  Recent Monitoring Events ({monitoringEvents.length})
                </h2>
                {unacknowledgedEvents.length > 0 && (
                  <span className="px-2 py-0.2 rounded-full bg-amber-950/80 text-amber-400 border border-amber-800 text-[10px] font-mono">
                    {unacknowledgedEvents.length} new
                  </span>
                )}
              </div>

              <div className="flex items-center gap-2">
                {unacknowledgedEvents.length > 0 && (
                  <button
                    onClick={() => db.acknowledgeAllEvents()}
                    className="text-[11px] font-mono text-cyan-400 hover:text-cyan-300 transition-colors flex items-center gap-1"
                  >
                    <CheckCircle2 className="w-3.5 h-3.5" />
                    <span>Acknowledge All</span>
                  </button>
                )}
                <button
                  onClick={() => onNavigate('monitoring')}
                  className="text-xs text-neutral-400 hover:text-cyan-400 flex items-center gap-1 transition-colors pl-2"
                >
                  <span>All Events</span>
                  <ArrowRight className="w-3 h-3" />
                </button>
              </div>
            </div>

            {monitoringEvents.length === 0 ? (
              <div className="p-8 text-center text-neutral-500 text-xs">
                No monitoring change events recorded yet. Periodic sweeps will generate notices on baseline drift.
              </div>
            ) : (
              <div className="divide-y divide-neutral-800/80">
                {monitoringEvents.slice(0, 6).map((evt) => (
                  <div
                    key={evt.id}
                    className={`p-3.5 hover:bg-neutral-800/30 transition-colors ${
                      !evt.acknowledgedAt ? 'bg-cyan-950/10' : ''
                    }`}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="space-y-1">
                        <div className="flex items-center gap-2 text-xs">
                          {getEventBadge(evt.eventType, evt.severity)}
                          <span className="text-neutral-500">·</span>
                          <span className="font-mono text-neutral-200">{evt.hostIp}</span>
                          {evt.port && (
                            <>
                              <span className="text-neutral-500">·</span>
                              <span className="font-mono text-neutral-400">
                                {evt.port}/{evt.protocol}
                              </span>
                            </>
                          )}
                        </div>
                        <p className="text-xs text-neutral-300 font-mono">{evt.description}</p>
                      </div>

                      <div className="flex items-center gap-3 shrink-0">
                        <span className="text-[11px] font-mono text-neutral-500 whitespace-nowrap">
                          {formatTimeAgo(evt.createdAt)}
                        </span>
                        {!evt.acknowledgedAt ? (
                          <button
                            onClick={() => db.acknowledgeEvent(evt.id)}
                            className="p-1 hover:bg-neutral-800 text-neutral-400 hover:text-emerald-400 rounded transition-colors"
                            title="Acknowledge event"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                          </button>
                        ) : (
                          <span className="text-[10px] font-mono text-neutral-600">Acked</span>
                        )}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Recent Completed Scans Table */}
          <div className="bg-neutral-900 border border-neutral-800 rounded">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                Recent Completed Scans
              </h2>
              <button
                onClick={() => onNavigate('history')}
                className="text-xs text-neutral-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              >
                <span>View All Scans</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 text-neutral-400 font-mono">
                    <th className="px-4 py-2.5">TARGET</th>
                    <th className="px-4 py-2.5">PROFILE</th>
                    <th className="px-4 py-2.5">HOSTS</th>
                    <th className="px-4 py-2.5">PORTS</th>
                    <th className="px-4 py-2.5">DURATION</th>
                    <th className="px-4 py-2.5">STATUS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-mono">
                  {scans.slice(0, 4).map((scan) => (
                    <tr key={scan.id} className="hover:bg-neutral-800/30">
                      <td className="px-4 py-2.5 text-neutral-200 font-semibold">{scan.target}</td>
                      <td className="px-4 py-2.5 text-neutral-400">{scan.profileName}</td>
                      <td className="px-4 py-2.5 tabular-nums text-neutral-300">
                        {scan.hostsDiscovered}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-neutral-300">
                        {scan.openPortsDiscovered}
                      </td>
                      <td className="px-4 py-2.5 tabular-nums text-neutral-400">
                        {scan.durationSeconds ? `${scan.durationSeconds}s` : '—'}
                      </td>
                      <td className="px-4 py-2.5">
                        <span className="text-emerald-400">Completed</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>

        {/* Right Col: Active Monitoring Schedules & Engine Status */}
        <div className="space-y-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded">
            <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Activity className="w-4 h-4 text-cyan-400" />
                <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                  Active Schedules ({monitoringJobs.length})
                </h2>
              </div>
              <button
                onClick={() => onNavigate('monitoring')}
                className="text-xs text-neutral-400 hover:text-cyan-400 flex items-center gap-1 transition-colors"
              >
                <span>Manage</span>
                <ArrowRight className="w-3 h-3" />
              </button>
            </div>

            <div className="p-3 space-y-3">
              {monitoringJobs.length === 0 ? (
                <div className="text-neutral-500 text-xs text-center py-4">
                  No active monitoring jobs configured.
                </div>
              ) : (
                monitoringJobs.map((job) => (
                  <div
                    key={job.id}
                    className="p-3 rounded bg-neutral-950/60 border border-neutral-800/90 space-y-2"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-neutral-200">{job.name}</span>
                      <span
                        className={`text-[11px] font-mono px-1.5 py-0.2 rounded border ${
                          job.runtimeState === 'running'
                            ? 'bg-cyan-950/60 text-cyan-300 border-cyan-800 animate-pulse font-bold'
                            : job.status === 'active'
                            ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900'
                            : job.status === 'paused'
                            ? 'bg-amber-950/40 text-amber-400 border-amber-900'
                            : 'bg-neutral-900 text-neutral-500 border-neutral-800'
                        }`}
                      >
                        ● {(job.runtimeState || job.status).toUpperCase()}
                      </span>
                    </div>

                    <div className="text-xs font-mono text-neutral-400 flex items-center justify-between">
                      <span>Target: {job.target}</span>
                      <span>Every {job.intervalSeconds}s</span>
                    </div>

                    {job.runtimeState === 'running' && job.currentScanId && (
                      <div className="text-[11px] font-mono text-cyan-400 flex items-center gap-1">
                        <Radio className="w-3 h-3 animate-spin" />
                        <span>Scanning ID: {job.currentScanId}</span>
                      </div>
                    )}

                    <div className="text-[11px] text-neutral-500 font-mono flex items-center justify-between border-t border-neutral-800/60 pt-2">
                      <span>Runs: {job.totalRuns}</span>
                      <span>Changes: {job.detectedChangesCount}</span>
                      <span>Last: {formatTimeAgo(job.lastRunAt)}</span>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>

          {/* Guardrails Card */}
          <div className="p-4 bg-neutral-900 border border-neutral-800 rounded text-xs space-y-2">
            <h3 className="font-semibold text-neutral-200 font-mono uppercase text-[11px] tracking-wider">
              Autonomous Scheduler Policy
            </h3>
            <p className="text-neutral-400 leading-relaxed">
              Periodic sweeps run without arbitrary shell execution. Concurrency is throttled to 2
              parallel tasks. On failure, scans retry up to 2 times before logging notices and
              resuming regular schedules.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
};
