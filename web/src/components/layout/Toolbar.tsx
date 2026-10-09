import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { ArrowDownUp, ArrowUp, Check, LayoutGrid, List, Menu, RefreshCw, Search, X } from 'lucide-react';
import type { RefObject } from 'react';
import { useDropTarget } from '../../hooks/useDropTarget';
import { cn } from '../../lib/cn';
import { parentPrefix } from '../../lib/paths';
import type { SortDir, SortKey } from '../../lib/entries';
import type { ViewMode } from '../../features/files/FileBrowser';
import { Breadcrumbs } from '../common/Breadcrumbs';
import { IconButton } from '../common/Button';

interface ToolbarProps {
  currentPrefix: string;
  rootLabel: string;
  search: string;
  searchRef: RefObject<HTMLInputElement | null>;
  view: ViewMode;
  sort: { key: SortKey; dir: SortDir };
  refreshing: boolean;
  onNavigate: (prefix: string) => void;
  onNavigateUp: () => void;
  onSearchChange: (value: string) => void;
  onViewChange: (view: ViewMode) => void;
  onSortChange: (key: SortKey, dir?: SortDir) => void;
  onRefresh: () => void;
  onOpenNav: () => void;
  /** True while entries are being dragged (the path and the up button become drop targets). */
  dragActive?: boolean;
  onDropToPrefix?: (prefix: string) => void;
}

const SORT_OPTIONS: { key: SortKey; label: string }[] = [
  { key: 'name', label: 'Name' },
  { key: 'modified', label: 'Last modified' },
  { key: 'size', label: 'Size' },
];

const menuClass = 'z-50 min-w-44 rounded-xl border border-line bg-surface-2 p-1.5 shadow-pop';
const menuItemClass =
  'flex cursor-pointer select-none items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none data-[highlighted]:bg-sunken';

function UpButton({ currentPrefix, dragActive, onNavigateUp, onDropToPrefix }: Pick<ToolbarProps, 'currentPrefix' | 'dragActive' | 'onNavigateUp' | 'onDropToPrefix'>) {
  const drop = useDropTarget({
    enabled: !!dragActive && !!currentPrefix && !!onDropToPrefix,
    onDrop: () => onDropToPrefix?.(parentPrefix(currentPrefix)),
  });
  return (
    <IconButton
      label="Up one folder"
      onClick={onNavigateUp}
      disabled={!currentPrefix}
      {...drop.handlers}
      className={cn(drop.over && 'bg-accent-soft text-accent ring-2 ring-accent')}
    >
      <ArrowUp className="size-4" />
    </IconButton>
  );
}

export function Toolbar(props: ToolbarProps) {
  const { view, sort, search } = props;

  return (
    <div className="flex flex-col gap-2 border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur sm:px-5">
      <div className="flex items-center gap-1.5">
        <IconButton label="Open navigation" className="lg:hidden" onClick={props.onOpenNav}>
          <Menu className="size-5" />
        </IconButton>
        <UpButton
          currentPrefix={props.currentPrefix}
          dragActive={props.dragActive}
          onNavigateUp={props.onNavigateUp}
          onDropToPrefix={props.onDropToPrefix}
        />
        <Breadcrumbs
          currentPrefix={props.currentPrefix}
          rootLabel={props.rootLabel}
          onNavigate={props.onNavigate}
          dragActive={props.dragActive}
          onDropToPrefix={props.onDropToPrefix}
        />
        <IconButton label="Refresh" onClick={props.onRefresh}>
          <RefreshCw className={cn('size-4', props.refreshing && 'animate-spin')} />
        </IconButton>
      </div>

      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink-3" />
          <input
            ref={props.searchRef}
            type="search"
            value={search}
            onChange={(e) => props.onSearchChange(e.target.value)}
            placeholder="Search this folder"
            aria-label="Search this folder"
            className="h-9 w-full rounded-lg border border-line bg-surface pl-9 pr-16 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 [&::-webkit-search-cancel-button]:hidden"
          />
          {search ? (
            <button
              type="button"
              onClick={() => props.onSearchChange('')}
              aria-label="Clear search"
              className="absolute right-2 top-1/2 inline-flex size-6 -translate-y-1/2 items-center justify-center rounded-md text-ink-3 hover:bg-sunken hover:text-ink"
            >
              <X className="size-3.5" />
            </button>
          ) : (
            <kbd className="pointer-events-none absolute right-2.5 top-1/2 hidden -translate-y-1/2 rounded border border-line bg-canvas px-1.5 font-mono text-[11px] text-ink-3 sm:block">
              /
            </kbd>
          )}
        </div>

        <DropdownMenu.Root>
          <DropdownMenu.Trigger asChild>
            <IconButton label="Sort" className="border border-line bg-surface">
              <ArrowDownUp className="size-4" />
            </IconButton>
          </DropdownMenu.Trigger>
          <DropdownMenu.Portal>
            <DropdownMenu.Content align="end" sideOffset={6} className={menuClass}>
              <DropdownMenu.Label className="px-2.5 py-1.5 text-xs font-medium uppercase tracking-wider text-ink-3">
                Sort by
              </DropdownMenu.Label>
              {SORT_OPTIONS.map((opt) => (
                <DropdownMenu.Item key={opt.key} className={menuItemClass} onSelect={() => props.onSortChange(opt.key)}>
                  <span className="flex-1">{opt.label}</span>
                  {sort.key === opt.key && <Check className="size-4 text-accent" />}
                </DropdownMenu.Item>
              ))}
              <DropdownMenu.Separator className="my-1 h-px bg-line" />
              {(['asc', 'desc'] as const).map((dir) => (
                <DropdownMenu.Item key={dir} className={menuItemClass} onSelect={() => props.onSortChange(sort.key, dir)}>
                  <span className="flex-1">{dir === 'asc' ? 'Ascending' : 'Descending'}</span>
                  {sort.dir === dir && <Check className="size-4 text-accent" />}
                </DropdownMenu.Item>
              ))}
            </DropdownMenu.Content>
          </DropdownMenu.Portal>
        </DropdownMenu.Root>

        <div role="group" aria-label="View mode" className="flex rounded-lg border border-line bg-surface p-0.5">
          {([
            { id: 'grid', label: 'Grid view', Icon: LayoutGrid },
            { id: 'list', label: 'List view', Icon: List },
          ] as const).map(({ id, label, Icon }) => (
            <button
              key={id}
              type="button"
              aria-label={label}
              title={label}
              aria-pressed={view === id}
              onClick={() => props.onViewChange(id)}
              className={cn(
                'inline-flex size-8 items-center justify-center rounded-md transition',
                view === id ? 'bg-surface-2 text-ink shadow-card' : 'text-ink-3 hover:text-ink',
              )}
            >
              <Icon className="size-4" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
