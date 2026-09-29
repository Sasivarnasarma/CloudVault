import { Folder, HardDrive, LayoutDashboard, Settings } from 'lucide-react';
import type { HealthResponse } from '../../types';

interface SidebarProps {
  activeTab: 'files' | 'dashboard' | 'settings';
  onTabChange: (tab: 'files' | 'dashboard' | 'settings') => void;
  health: HealthResponse | null;
  totalObjects: number;
}

export function Sidebar({ activeTab, onTabChange, health, totalObjects }: SidebarProps) {
  const navItems = [
    { id: 'files', label: 'My Files', icon: Folder },
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'settings', label: 'Settings', icon: Settings },
  ] as const;

  return (
    <aside className="w-64 bg-slate-900/60 border-r border-slate-800 p-4 hidden md:flex md:flex-col justify-between shrink-0">
      <div className="space-y-6">
        <div>
          <p className="px-3 text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            Navigation
          </p>
          <nav className="space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  onClick={() => onTabChange(item.id)}
                  className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl font-medium text-sm transition-colors ${
                    isActive
                      ? 'bg-indigo-600/20 text-indigo-400 border border-indigo-500/30'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Bucket Stats Card */}
        <div className="p-4 rounded-xl glass-card border border-slate-800 space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-slate-400 uppercase tracking-wider">
            <HardDrive className="w-4 h-4 text-indigo-400" />
            <span>Target Bucket</span>
          </div>
          <div>
            <p className="text-sm font-semibold text-white font-mono truncate">
              {health?.bucket || 'cloudvault'}
            </p>
            <p className="text-xs text-slate-400">
              Provider: <span className="text-indigo-400 font-medium capitalize">{health?.storage_provider || 'r2'}</span>
            </p>
          </div>
          <div className="pt-2 border-t border-slate-800 flex justify-between text-xs text-slate-400">
            <span>Visible Objects:</span>
            <span className="font-semibold text-white">{totalObjects}</span>
          </div>
        </div>
      </div>

      <div className="p-3 text-xs text-slate-500 border-t border-slate-800/60 text-center">
        CloudVault v0.1.0
      </div>
    </aside>
  );
}
