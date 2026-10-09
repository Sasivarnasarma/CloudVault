import * as Tooltip from '@radix-ui/react-tooltip';
import {
  Cloud,
  FileText,
  FolderPlus,
  HardDrive,
  Image as ImageIcon,
  LayoutGrid,
  Moon,
  Music2,
  Sun,
  Upload,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../../lib/cn';
import type { CategoryFilter } from '../../lib/fileKind';
import type { ThemeMode } from '../../hooks/useTheme';
import type { HealthResponse } from '../../types';
import { Button, IconButton } from '../common/Button';

interface SidebarProps {
  health: HealthResponse | null;
  healthLoading: boolean;
  healthError: boolean;
  filter: CategoryFilter;
  counts: Record<CategoryFilter, number>;
  theme: ThemeMode;
  onFilterChange: (filter: CategoryFilter) => void;
  onUpload: () => void;
  onNewFolder: () => void;
  onToggleTheme: () => void;
  onNavigateHome: () => void;
}

const FILTERS: { id: CategoryFilter; label: string; icon: ComponentType<{ className?: string }> }[] = [
  { id: 'all', label: 'All files', icon: LayoutGrid },
  { id: 'documents', label: 'Documents', icon: FileText },
  { id: 'images', label: 'Images', icon: ImageIcon },
  { id: 'media', label: 'Audio & video', icon: Music2 },
];

function ConnectionStatus({ health, loading, error }: { health: HealthResponse | null; loading: boolean; error: boolean }) {
  const online = !!health?.storage_connected;
  const state = loading ? 'Connecting…' : error ? 'API offline' : online ? 'Connected' : 'Storage unreachable';
  const dot = loading ? 'bg-ink-3 animate-pulse' : online ? 'bg-accent' : 'bg-danger';

  return (
    <div className="rounded-xl border border-line bg-surface-2 p-3">
      <div className="flex items-center gap-2 text-sm font-medium text-ink">
        <span className={cn('size-2 rounded-full', dot)} aria-hidden="true" />
        {state}
      </div>
      {health && (
        <dl className="mt-2.5 space-y-1 text-xs text-ink-3">
          <div className="flex items-center gap-1.5">
            <HardDrive className="size-3.5 shrink-0" />
            <dt className="sr-only">Bucket</dt>
            <dd className="truncate font-mono" title={health.bucket}>
              {health.bucket}
            </dd>
          </div>
          <div className="pl-5 uppercase tracking-wider">
            <dt className="sr-only">Provider</dt>
            <dd>{health.storage_provider}</dd>
          </div>
        </dl>
      )}
    </div>
  );
}

export function Sidebar(props: SidebarProps) {
  const { health, healthLoading, healthError, filter, counts, theme, onFilterChange } = props;

  return (
    <Tooltip.Provider delayDuration={300}>
      <div className="flex h-full flex-col gap-5 p-4">
        <button
          type="button"
          onClick={props.onNavigateHome}
          className="flex items-center gap-2.5 rounded-lg px-1 py-1 text-left"
          aria-label="CloudVault home"
        >
          <span className="flex size-9 items-center justify-center rounded-xl bg-accent text-accent-ink shadow-card">
            <Cloud className="size-5" />
          </span>
          <span className="text-lg font-semibold tracking-tight text-ink">CloudVault</span>
        </button>

        <div className="grid grid-cols-2 gap-2">
          <Button variant="primary" onClick={props.onUpload}>
            <Upload className="size-4" />
            Upload
          </Button>
          <Button variant="secondary" onClick={props.onNewFolder}>
            <FolderPlus className="size-4 text-folder-deep" />
            Folder
          </Button>
        </div>

        <nav aria-label="File categories" className="flex-1">
          <p className="mb-2 px-2 text-xs font-medium uppercase tracking-wider text-ink-3">In this folder</p>
          <ul className="space-y-0.5">
            {FILTERS.map(({ id, label, icon: Icon }) => {
              const active = filter === id;
              return (
                <li key={id}>
                  <button
                    type="button"
                    onClick={() => onFilterChange(id)}
                    aria-current={active ? 'true' : undefined}
                    className={cn(
                      'flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition',
                      active ? 'bg-accent-soft font-medium text-accent' : 'text-ink-2 hover:bg-sunken hover:text-ink',
                    )}
                  >
                    <Icon className="size-4" />
                    <span className="flex-1 text-left">{label}</span>
                    <span className="font-mono text-xs tabular-nums opacity-70">{counts[id]}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        </nav>

        <div className="space-y-3">
          <ConnectionStatus health={health} loading={healthLoading} error={healthError} />
          <div className="flex items-center justify-between px-1 text-xs text-ink-3">
            <span>v{health?.version ?? '0.1.0'}</span>
            <Tooltip.Root>
              <Tooltip.Trigger asChild>
                <IconButton
                  label={theme === 'light' ? 'Switch to dark theme' : 'Switch to light theme'}
                  onClick={props.onToggleTheme}
                >
                  {theme === 'light' ? <Moon className="size-4" /> : <Sun className="size-4" />}
                </IconButton>
              </Tooltip.Trigger>
              <Tooltip.Portal>
                <Tooltip.Content
                  side="top"
                  sideOffset={6}
                  className="z-50 rounded-md bg-ink px-2 py-1 text-xs text-canvas shadow-pop"
                >
                  {theme === 'light' ? 'Dark theme' : 'Light theme'}
                </Tooltip.Content>
              </Tooltip.Portal>
            </Tooltip.Root>
          </div>
        </div>
      </div>
    </Tooltip.Provider>
  );
}
