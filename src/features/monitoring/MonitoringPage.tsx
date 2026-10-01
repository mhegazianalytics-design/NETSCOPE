import React, { useState } from 'react';
import {
  Activity,
  Plus,
  Play,
  Pause,
  Trash2,
  BookmarkCheck,
  ShieldAlert,
  Clock,
  CheckCircle2,
  AlertCircle,
  Square,
  Radio,
  Bell,
  Check,
  RefreshCw,
  Sliders,
} from 'lucide-react';
import {
  MonitoringEngineStatus,
  MonitoringEvent,
  MonitoringJob,
  PortWatchlistItem,
  ScanProfileId,
} from '../../types';
import { SCAN_PROFILES } from '../../lib/nmap/profiles';
import { validateTarget } from '../../lib/validation/targetValidator';
import { db } from '../../lib/database/mockStorage';
import { Modal } from '../../components/common/Modal';

interface MonitoringPageProps {
  monitoringJobs: MonitoringJob[];
  monitoringEvents?: MonitoringEvent[];
  engineStatus?: MonitoringEngineStatus | null;
  watchlist: PortWatchlistItem[];
}

export const MonitoringPage: React.FC<MonitoringPageProps> = ({
  monitoringJobs,
  monitoringEvents = [],
  engineStatus,
  watchlist,
}) => {
  const [activeTab, setActiveTab] = useState<'jobs' | 'events' | 'watchlist'>('jobs');
  const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
  const [newJobName, setNewJobName] = useState('');
  const [newJobTarget, setNewJobTarget] = useState('192.168.1.0/24');
  const [newJobInterval, setNewJobInterval] = useState(60);
  const [newJobTimeout, setNewJobTimeout] = useState(120);
  const [newJobProfile, setNewJobProfile] = useState<ScanProfileId>('common-services');
  const [selectedWatchPorts, setSelectedWatchPorts] = useState<number[]>(
    watchlist.filter((w) => w.enabled).map((w) => w.port)
  );
  const [newJobError, setNewJobError] = useState('');

  // Port watchlist form
  const [newWatchPort, setNewWatchPort] = useState('');
  const [newWatchService, setNewWatchService] = useState('');
  const [newWatchDesc, setNewWatchDesc] = useState('');

  // Events filter
  const [filterUnackedOnly, setFilterUnackedOnly] = useState(false);

  const handleCreateJob = async (e: React.FormEvent) => {
    e.preventDefault();
    setNewJobError('');

    const targetVal = validateTarget(newJobTarget);
    if (!targetVal.isValid || !targetVal.normalizedTarget) {
      setNewJobError(targetVal.error || 'Invalid target specification.');
      return;
    }

    if (newJobInterval < 15) {
      setNewJobError('Minimum allowable scan interval is 15 seconds for safety.');
      return;
    }

    // Check duplicate
    const exists = monitoringJobs.some(
      (j) => j.target === targetVal.normalizedTarget && j.profileId === newJobProfile
    );
    if (exists) {
      setNewJobError('A monitoring job for this target and profile combination already exists.');
      return;
    }

    try {
      await db.createMonitoringJob({
        name: newJobName.trim() || `Sweep ${targetVal.normalizedTarget}`,
        target: targetVal.normalizedTarget,
        profileId: newJobProfile,
        intervalSeconds: Number(newJobInterval) || 60,
        scanTimeoutSeconds: Number(newJobTimeout) || 120,
        watchPorts: selectedWatchPorts,
        status: 'active',
      });

      setIsCreateModalOpen(false);
      setNewJobName('');
      setNewJobError('');
    } catch (err: any) {
      setNewJobError(err.message || 'Failed to create monitoring job.');
    }
  };

  const handleAddWatchPort = (e: React.FormEvent) => {
    e.preventDefault();
    const portNum = parseInt(newWatchPort, 10);
    if (isNaN(portNum) || portNum < 1 || portNum > 65535) return;

    db.addWatchlistPort({
      port: portNum,
      protocol: 'tcp',
      serviceName: newWatchService.trim() || 'Custom',
      description: newWatchDesc.trim() || 'Operator configured port',
      enabled: true,
      riskNote: 'Monitored listener',
    });

    setNewWatchPort('');
    setNewWatchService('');
    setNewWatchDesc('');
  };

  const formatTime = (dateStr?: string) => {
    if (!dateStr) return '—';
    return new Date(dateStr).toLocaleTimeString();
  };

  const unackedEvents = monitoringEvents.filter((e) => !e.acknowledgedAt);
  const displayedEvents = filterUnackedOnly ? unackedEvents : monitoringEvents;

  return (
    <div className="space-y-6">
      {/* Title & Top Action */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold tracking-tight text-neutral-100">
              Continuous Assessment & Monitoring
            </h1>
            <span className="px-2 py-0.5 rounded text-[11px] font-mono bg-neutral-900 border border-neutral-800 text-neutral-400">
              Concurrency: {engineStatus?.maxConcurrency || 2} max
            </span>
          </div>
          <p className="text-xs text-neutral-400 mt-1">
            Autonomous local scheduler executing authorized Nmap baseline sweeps and streaming change events.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCreateModalOpen(true)}
            className="flex items-center gap-2 px-3.5 py-1.5 bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-semibold text-xs rounded transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>New Monitoring Job</span>
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-2 border-b border-neutral-800 pb-2">
        <button
          onClick={() => setActiveTab('jobs')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            activeTab === 'jobs'
              ? 'bg-neutral-800 text-cyan-400 font-semibold border border-neutral-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Activity className="w-3.5 h-3.5" />
          <span>Schedules ({monitoringJobs.length})</span>
        </button>

        <button
          onClick={() => setActiveTab('events')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            activeTab === 'events'
              ? 'bg-neutral-800 text-cyan-400 font-semibold border border-neutral-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <Bell className="w-3.5 h-3.5" />
          <span>Events ({monitoringEvents.length})</span>
          {unackedEvents.length > 0 && (
            <span className="px-1.5 py-0.2 rounded-full bg-amber-950 text-amber-400 text-[10px]">
              {unackedEvents.length}
            </span>
          )}
        </button>

        <button
          onClick={() => setActiveTab('watchlist')}
          className={`flex items-center gap-2 px-3 py-1.5 rounded text-xs font-mono transition-colors ${
            activeTab === 'watchlist'
              ? 'bg-neutral-800 text-cyan-400 font-semibold border border-neutral-700'
              : 'text-neutral-400 hover:text-neutral-200'
          }`}
        >
          <BookmarkCheck className="w-3.5 h-3.5" />
          <span>Port Watchlist ({watchlist.length})</span>
        </button>
      </div>

      {/* TAB 1: Monitoring Jobs List (Requirement 19) */}
      {activeTab === 'jobs' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Activity className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                Configured Schedules ({monitoringJobs.length})
              </h2>
            </div>
          </div>

          {monitoringJobs.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">
              No monitoring jobs configured. Click &quot;New Monitoring Job&quot; to establish an automated baseline audit.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/80 font-mono text-xs">
              {monitoringJobs.map((job) => {
                const isRunning = job.runtimeState === 'running';
                const isPausing = job.runtimeState === 'pausing';
                const isPaused = job.status === 'paused' || job.runtimeState === 'paused';
                const isStopped = job.status === 'stopped' || job.runtimeState === 'stopped';
                const isFailed = job.runtimeState === 'failed';

                return (
                  <div
                    key={job.id}
                    className={`p-4 hover:bg-neutral-800/30 transition-colors flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
                      isRunning ? 'bg-cyan-950/10 border-l-2 border-l-cyan-500' : ''
                    }`}
                  >
                    <div className="space-y-1.5 flex-1">
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-neutral-100 text-sm">{job.name}</span>

                        {/* Runtime State Badge */}
                        <span
                          className={`text-[11px] px-2 py-0.5 rounded border ${
                            isRunning
                              ? 'bg-cyan-950/80 text-cyan-300 border-cyan-700 animate-pulse font-bold'
                              : isPausing
                              ? 'bg-amber-950/80 text-amber-300 border-amber-800'
                              : isPaused
                              ? 'bg-neutral-900 text-amber-400 border-neutral-800'
                              : isStopped
                              ? 'bg-neutral-900 text-neutral-500 border-neutral-800'
                              : isFailed
                              ? 'bg-rose-950/80 text-rose-300 border-rose-800 font-bold'
                              : 'bg-emerald-950/40 text-emerald-400 border-emerald-900'
                          }`}
                        >
                          ● {(job.runtimeState || job.status).toUpperCase()}
                        </span>

                        {isRunning && (
                          <span className="flex items-center gap-1 text-[11px] text-cyan-400">
                            <Radio className="w-3.5 h-3.5 animate-spin" />
                            <span>Scan ID: {job.currentScanId || 'active'}</span>
                          </span>
                        )}
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-neutral-400 text-xs">
                        <span>Target: <strong className="text-neutral-200">{job.target}</strong></span>
                        <span className="text-neutral-600">·</span>
                        <span>Interval: {job.intervalSeconds}s</span>
                        <span className="text-neutral-600">·</span>
                        <span>Timeout: {job.scanTimeoutSeconds || 120}s</span>
                        <span className="text-neutral-600">·</span>
                        <span>Profile: {SCAN_PROFILES[job.profileId]?.name || job.profileId}</span>
                      </div>

                      {job.lastError && (
                        <div className="text-[11px] text-rose-400 flex items-center gap-1.5 pt-0.5">
                          <AlertCircle className="w-3.5 h-3.5 shrink-0" />
                          <span className="truncate">{job.lastError}</span>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-4 text-[11px] text-neutral-500 pt-0.5">
                        <span>Total Runs: {job.totalRuns}</span>
                        <span>Baseline Changes: {job.detectedChangesCount}</span>
                        <span>Failures: {job.failureCount || 0}</span>
                        <span>Last Run: {formatTime(job.lastRunAt)}</span>
                        <span>Next Run: {job.status === 'active' ? formatTime(job.nextRunAt) : 'Paused'}</span>
                      </div>
                    </div>

                    {/* Job Controls (Requirement 19: START/RESUME, PAUSE, STOP, DELETE) */}
                    <div className="flex items-center gap-2 shrink-0">
                      {isPaused || isStopped ? (
                        <button
                          onClick={() => db.resumeMonitoringJob(job.id)}
                          className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 rounded text-xs font-mono transition-colors flex items-center gap-1.5"
                          title="Resume automated schedule"
                        >
                          <Play className="w-3.5 h-3.5" />
                          <span>Resume</span>
                        </button>
                      ) : (
                        <button
                          onClick={() => db.pauseMonitoringJob(job.id)}
                          className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 rounded text-xs font-mono transition-colors flex items-center gap-1.5"
                          title="Pause schedule after current scan"
                        >
                          <Pause className="w-3.5 h-3.5" />
                          <span>{isPausing ? 'Pausing...' : 'Pause'}</span>
                        </button>
                      )}

                      {!isStopped && (
                        <button
                          onClick={() => db.stopMonitoringJob(job.id)}
                          className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 rounded text-xs font-mono transition-colors flex items-center gap-1.5"
                          title="Stop job and cancel any running scan"
                        >
                          <Square className="w-3.5 h-3.5" />
                          <span>Stop</span>
                        </button>
                      )}

                      <button
                        onClick={() => db.deleteMonitoringJob(job.id)}
                        className="p-1.5 text-neutral-500 hover:text-rose-400 hover:bg-neutral-800 rounded transition-colors"
                        title="Delete Job"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: Monitoring Events Log (Requirement 16, 17, 23, 24) */}
      {activeTab === 'events' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded">
          <div className="px-4 py-3 border-b border-neutral-800 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <Bell className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                Monitoring Change Events & Alerts ({displayedEvents.length})
              </h2>
            </div>

            <div className="flex items-center gap-3">
              <label className="flex items-center gap-1.5 text-xs font-mono text-neutral-400 cursor-pointer">
                <input
                  type="checkbox"
                  checked={filterUnackedOnly}
                  onChange={(e) => setFilterUnackedOnly(e.target.checked)}
                  className="rounded bg-neutral-800 border-neutral-700 text-cyan-500 focus:ring-0"
                />
                <span>Unacknowledged Only ({unackedEvents.length})</span>
              </label>

              {unackedEvents.length > 0 && (
                <button
                  onClick={() => db.acknowledgeAllEvents()}
                  className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-cyan-300 text-xs font-mono rounded flex items-center gap-1 transition-colors"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Acknowledge All</span>
                </button>
              )}
            </div>
          </div>

          {displayedEvents.length === 0 ? (
            <div className="p-8 text-center text-neutral-500 text-xs">
              No monitoring events matching current filter.
            </div>
          ) : (
            <div className="divide-y divide-neutral-800/80 font-mono text-xs">
              {displayedEvents.map((evt) => (
                <div
                  key={evt.id}
                  className={`p-3.5 hover:bg-neutral-800/30 transition-colors flex items-start justify-between gap-4 ${
                    !evt.acknowledgedAt ? 'bg-cyan-950/10' : ''
                  }`}
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <span className={`px-1.5 py-0.5 rounded text-[11px] border font-bold ${
                        evt.eventType === 'PORT_OPENED'
                          ? evt.severity === 'warning'
                            ? 'bg-amber-950/60 text-amber-300 border-amber-800'
                            : 'bg-amber-950/30 text-amber-400 border-amber-900'
                          : evt.eventType === 'NEW_HOST'
                          ? 'bg-emerald-950/40 text-emerald-400 border-emerald-900'
                          : evt.eventType === 'SCAN_FAILED'
                          ? 'bg-rose-950/60 text-rose-300 border-rose-800'
                          : 'bg-neutral-800 text-neutral-400 border-neutral-700'
                      }`}>
                        {evt.eventType}
                      </span>
                      <span className="text-neutral-500">·</span>
                      <span className="text-neutral-200">{evt.hostIp}</span>
                      {evt.port && <span className="text-neutral-400">Port {evt.port}/{evt.protocol}</span>}
                    </div>

                    <p className="text-neutral-300 text-xs">{evt.description}</p>
                    <div className="text-[11px] text-neutral-500 flex items-center gap-3">
                      <span>Source Job: {evt.monitoringJobId}</span>
                      <span>Scan ID: {evt.scanId}</span>
                      <span>Timestamp: {new Date(evt.createdAt).toLocaleString()}</span>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {!evt.acknowledgedAt ? (
                      <button
                        onClick={() => db.acknowledgeEvent(evt.id)}
                        className="px-2.5 py-1 bg-neutral-800 hover:bg-neutral-700 text-emerald-400 rounded text-[11px] flex items-center gap-1 transition-colors"
                        title="Mark event as acknowledged"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Ack</span>
                      </button>
                    ) : (
                      <span className="text-[11px] text-neutral-500 font-mono">
                        Acked at {new Date(evt.acknowledgedAt).toLocaleTimeString()}
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: Port Watchlist Section (Preserved) */}
      {activeTab === 'watchlist' && (
        <div className="bg-neutral-900 border border-neutral-800 rounded">
          <div className="px-4 py-3 border-b border-neutral-800 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <BookmarkCheck className="w-4 h-4 text-cyan-400" />
              <h2 className="text-xs font-semibold text-neutral-200 uppercase font-mono tracking-wider">
                Monitored Port Watchlist ({watchlist.length})
              </h2>
            </div>
          </div>

          <div className="p-4 space-y-4">
            <p className="text-xs text-neutral-400">
              Define high-interest service ports to track closely. When a monitored port is opened or changed, elevated severity change events (WARNING) are recorded.
            </p>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {watchlist.map((item) => (
                <div
                  key={item.id}
                  className={`p-3 rounded border transition-colors ${
                    item.enabled
                      ? 'bg-neutral-950/70 border-neutral-800'
                      : 'bg-neutral-950/30 border-neutral-900 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <div className="flex items-center gap-2 font-mono">
                      <span className="font-semibold text-neutral-100 text-sm">{item.port}</span>
                      <span className="text-xs text-neutral-400">/{item.protocol}</span>
                      <span className="text-xs text-cyan-400">{item.serviceName}</span>
                    </div>

                    <input
                      type="checkbox"
                      checked={item.enabled}
                      onChange={() => db.toggleWatchlistPort(item.id)}
                      className="rounded bg-neutral-800 border-neutral-700 text-cyan-500 focus:ring-0 cursor-pointer"
                    />
                  </div>

                  <p className="text-xs text-neutral-400 leading-snug">{item.description}</p>
                  <div className="mt-2 text-[11px] font-mono text-neutral-500 flex items-center gap-1">
                    <ShieldAlert className="w-3 h-3 text-amber-500/80 shrink-0" />
                    <span className="truncate">{item.riskNote}</span>
                  </div>
                </div>
              ))}
            </div>

            {/* Add Port to Watchlist Form */}
            <form
              onSubmit={handleAddWatchPort}
              className="pt-3 border-t border-neutral-800/80 flex flex-wrap items-center gap-3"
            >
              <input
                type="number"
                placeholder="Port (e.g. 8443)"
                value={newWatchPort}
                onChange={(e) => setNewWatchPort(e.target.value)}
                min="1"
                max="65535"
                className="w-28 px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-xs font-mono text-neutral-200"
              />
              <input
                type="text"
                placeholder="Service (e.g. HTTPS-ALT)"
                value={newWatchService}
                onChange={(e) => setNewWatchService(e.target.value)}
                className="w-36 px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-xs font-mono text-neutral-200"
              />
              <input
                type="text"
                placeholder="Description"
                value={newWatchDesc}
                onChange={(e) => setNewWatchDesc(e.target.value)}
                className="flex-1 min-w-[200px] px-3 py-1.5 bg-neutral-950 border border-neutral-700 rounded text-xs font-mono text-neutral-200"
              />
              <button
                type="submit"
                className="px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-200 text-xs font-mono rounded transition-colors"
              >
                Add Port
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Create Job Modal (Requirement 20) */}
      {isCreateModalOpen && (
        <Modal
          isOpen={true}
          onClose={() => setIsCreateModalOpen(false)}
          title="Create Continuous Monitoring Job"
          subtitle="Configure periodic baseline assessment on an authorized target."
        >
          <form onSubmit={handleCreateJob} className="space-y-4">
            {newJobError && (
              <div className="p-2.5 bg-rose-950/60 border border-rose-800 rounded text-rose-300 text-xs flex items-center gap-2">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{newJobError}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                Job Name (Optional)
              </label>
              <input
                type="text"
                value={newJobName}
                onChange={(e) => setNewJobName(e.target.value)}
                placeholder="e.g. Office Subnet Periodic Sweep"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-100 font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                Authorized Target
              </label>
              <input
                type="text"
                value={newJobTarget}
                onChange={(e) => setNewJobTarget(e.target.value)}
                placeholder="e.g. 192.168.1.0/24 or 10.0.0.5"
                className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-100 font-mono"
              />
              <p className="text-[11px] text-neutral-500 font-mono mt-1">
                Input is verified against injection patterns before every scheduled execution.
              </p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div>
                <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                  Interval (Seconds)
                </label>
                <input
                  type="number"
                  min="15"
                  max="86400"
                  value={newJobInterval}
                  onChange={(e) => setNewJobInterval(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-100 font-mono"
                />
                <span className="text-[10px] text-neutral-500">Min 15s for safety</span>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                  Timeout (Seconds)
                </label>
                <input
                  type="number"
                  min="30"
                  max="600"
                  value={newJobTimeout}
                  onChange={(e) => setNewJobTimeout(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-100 font-mono"
                />
                <span className="text-[10px] text-neutral-500">Default 120s</span>
              </div>

              <div>
                <label className="block text-xs font-mono uppercase text-neutral-400 mb-1">
                  Profile
                </label>
                <select
                  value={newJobProfile}
                  onChange={(e) => setNewJobProfile(e.target.value as ScanProfileId)}
                  className="w-full px-3 py-2 bg-neutral-950 border border-neutral-700 rounded text-xs text-neutral-100 font-mono"
                >
                  <option value="common-services">Common Services (Top 100)</option>
                  <option value="service-detection">Service Detection (-sV)</option>
                  <option value="host-discovery">Host Discovery (-sn)</option>
                  <option value="custom-authorized">Custom Watchlist Ports</option>
                </select>
              </div>
            </div>

            {/* Watchlist port checkboxes */}
            <div>
              <label className="block text-xs font-mono uppercase text-neutral-400 mb-2">
                Watchlist Listeners to Include
              </label>
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto p-2 bg-neutral-950 border border-neutral-800 rounded">
                {watchlist.map((item) => (
                  <label
                    key={item.id}
                    className="flex items-center gap-1.5 px-2 py-1 bg-neutral-900 border border-neutral-800 rounded text-xs font-mono text-neutral-300 cursor-pointer"
                  >
                    <input
                      type="checkbox"
                      checked={selectedWatchPorts.includes(item.port)}
                      onChange={(e) => {
                        if (e.target.checked) {
                          setSelectedWatchPorts([...selectedWatchPorts, item.port]);
                        } else {
                          setSelectedWatchPorts(selectedWatchPorts.filter((p) => p !== item.port));
                        }
                      }}
                      className="rounded bg-neutral-800 border-neutral-700 text-cyan-500 focus:ring-0"
                    />
                    <span>{item.port}/{item.serviceName}</span>
                  </label>
                ))}
              </div>
            </div>

            <div className="p-3 bg-neutral-950 border border-neutral-800 rounded text-xs text-neutral-400 flex items-start gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>
                Monitoring will repeatedly execute safe probes on schedule, compare with baseline, and alert on state deviations.
              </span>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setIsCreateModalOpen(false)}
                className="px-4 py-2 border border-neutral-700 hover:bg-neutral-800 text-neutral-300 text-xs rounded transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="px-4 py-2 bg-cyan-600 hover:bg-cyan-500 text-neutral-950 font-bold text-xs rounded transition-colors"
              >
                Create Job
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
};
