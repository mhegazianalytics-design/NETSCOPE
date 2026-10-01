import React from 'react';
import {
  LayoutDashboard,
  Radar,
  Server,
  Network,
  Activity,
  History,
  FileText,
  Settings,
} from 'lucide-react';

export type NavPage =
  | 'dashboard'
  | 'scanner'
  | 'hosts'
  | 'ports'
  | 'monitoring'
  | 'history'
  | 'reports'
  | 'settings';

interface SidebarProps {
  currentPage: NavPage;
  onSelectPage: (page: NavPage) => void;
  hostsCount: number;
  changesCount: number;
  activeJobsCount: number;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentPage,
  onSelectPage,
  hostsCount,
  changesCount,
  activeJobsCount,
}) => {
  const navItems: { id: NavPage; label: string; icon: React.ElementType; badge?: number }[] = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'scanner', label: 'Scanner', icon: Radar },
    { id: 'hosts', label: 'Hosts', icon: Server, badge: hostsCount },
    { id: 'ports', label: 'Ports', icon: Network },
    { id: 'monitoring', label: 'Monitoring', icon: Activity, badge: activeJobsCount },
    { id: 'history', label: 'History', icon: History, badge: changesCount > 0 ? changesCount : undefined },
    { id: 'reports', label: 'Reports', icon: FileText },
    { id: 'settings', label: 'Settings', icon: Settings },
  ];

  return (
    <aside className="w-56 bg-neutral-900 border-r border-neutral-800 flex flex-col shrink-0">
      <div className="p-3 text-[11px] font-mono tracking-wider text-neutral-400 uppercase border-b border-neutral-800/60">
        Navigation
      </div>

      <nav className="p-2 space-y-1 flex-1">
        {navItems.map((item) => {
          const Icon = item.icon;
          const isActive = currentPage === item.id;
          return (
            <button
              key={item.id}
              onClick={() => onSelectPage(item.id)}
              className={`w-full flex items-center justify-between px-3 py-2 text-xs font-medium rounded transition-colors text-left ${
                isActive
                  ? 'bg-neutral-800 text-neutral-100 border border-neutral-700/80 shadow-xs'
                  : 'text-neutral-400 hover:text-neutral-200 hover:bg-neutral-800/40'
              }`}
            >
              <div className="flex items-center gap-2.5">
                <Icon
                  className={`w-4 h-4 ${
                    isActive ? 'text-cyan-400' : 'text-neutral-400'
                  }`}
                />
                <span>{item.label}</span>
              </div>

              {item.badge !== undefined && item.badge > 0 && (
                <span
                  className={`text-[11px] font-mono px-1.5 py-0.5 rounded ${
                    isActive
                      ? 'bg-neutral-700 text-neutral-200'
                      : 'bg-neutral-800 text-neutral-400'
                  }`}
                >
                  {item.badge}
                </span>
              )}
            </button>
          );
        })}
      </nav>

      {/* Scope Disclaimer footer */}
      <div className="p-3 border-t border-neutral-800 bg-neutral-950/40 text-[11px] text-neutral-400 leading-tight">
        <p className="font-medium text-neutral-400 mb-1">Operational Scope</p>
        <p>Restricted to operator-owned subnets & authorized targets only.</p>
      </div>
    </aside>
  );
};
