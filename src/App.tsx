import React, { useState, useEffect } from 'react';
import { TopBar } from './components/layout/TopBar';
import { Sidebar, NavPage } from './components/layout/Sidebar';
import { DashboardPage } from './features/dashboard/DashboardPage';
import { ScannerPage } from './features/scanner/ScannerPage';
import { HostsPage } from './features/hosts/HostsPage';
import { PortsPage } from './features/ports/PortsPage';
import { MonitoringPage } from './features/monitoring/MonitoringPage';
import { HistoryPage } from './features/history/HistoryPage';
import { ReportsPage } from './features/reports/ReportsPage';
import { SettingsPage } from './features/settings/SettingsPage';
import { db } from './lib/database/mockStorage';

export default function App() {
  const [currentPage, setCurrentPage] = useState<NavPage>('dashboard');
  const [hosts, setHosts] = useState(db.getHosts());
  const [ports, setPorts] = useState(db.getPorts());
  const [scans, setScans] = useState(db.getScans());
  const [changes, setChanges] = useState(db.getChanges());
  const [monitoringJobs, setMonitoringJobs] = useState(db.getMonitoringJobs());
  const [monitoringEvents, setMonitoringEvents] = useState(db.getMonitoringEvents());
  const [engineStatus, setEngineStatus] = useState(db.getEngineStatus());
  const [watchlist, setWatchlist] = useState(db.getWatchlist());

  useEffect(() => {
    return db.subscribe(() => {
      setHosts(db.getHosts());
      setPorts(db.getPorts());
      setScans(db.getScans());
      setChanges(db.getChanges());
      setMonitoringJobs(db.getMonitoringJobs());
      setMonitoringEvents(db.getMonitoringEvents());
      setEngineStatus(db.getEngineStatus());
      setWatchlist(db.getWatchlist());
    });
  }, []);

  const activeJobsCount = monitoringJobs.filter((j) => j.status === 'active').length;
  const unacknowledgedEventsCount = monitoringEvents.filter((e) => !e.acknowledgedAt).length;

  return (
    <div className="flex flex-col h-screen w-screen overflow-hidden bg-neutral-950 text-neutral-100 font-sans">
      {/* Universal Top Bar */}
      <TopBar onNavigateToSettings={() => setCurrentPage('settings')} />

      {/* Main App Workspace */}
      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar Navigation */}
        <Sidebar
          currentPage={currentPage}
          onSelectPage={setCurrentPage}
          hostsCount={hosts.length}
          changesCount={changes.length}
          activeJobsCount={activeJobsCount}
        />

        {/* Viewport Content Canvas */}
        <main className="flex-1 overflow-y-auto p-6 bg-neutral-950">
          <div className="max-w-7xl mx-auto">
            {currentPage === 'dashboard' && (
              <DashboardPage
                hosts={hosts}
                ports={ports}
                scans={scans}
                changes={changes}
                monitoringJobs={monitoringJobs}
                monitoringEvents={monitoringEvents}
                engineStatus={engineStatus}
                onNavigate={setCurrentPage}
              />
            )}

            {currentPage === 'scanner' && (
              <ScannerPage
                onScanCompleted={() => setScans(db.getScans())}
                onNavigateToSettings={() => setCurrentPage('settings')}
              />
            )}

            {currentPage === 'hosts' && (
              <HostsPage hosts={hosts} ports={ports} changes={changes} />
            )}

            {currentPage === 'ports' && (
              <PortsPage ports={ports} watchlist={watchlist} />
            )}

            {currentPage === 'monitoring' && (
              <MonitoringPage
                monitoringJobs={monitoringJobs}
                monitoringEvents={monitoringEvents}
                engineStatus={engineStatus}
                watchlist={watchlist}
              />
            )}

            {currentPage === 'history' && (
              <HistoryPage
                scans={scans}
                hosts={hosts}
                ports={ports}
                changes={changes}
              />
            )}

            {currentPage === 'reports' && (
              <ReportsPage hosts={hosts} ports={ports} changes={changes} />
            )}

            {currentPage === 'settings' && (
              <SettingsPage />
            )}
          </div>
        </main>
      </div>
    </div>
  );
}
