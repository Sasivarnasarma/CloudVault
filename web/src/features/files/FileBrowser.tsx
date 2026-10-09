import { ArrowDown, ArrowUp, Copy, Download, FolderInput, FolderOpen, Info, Pencil, Trash2 } from 'lucide-react';
import { motion } from 'motion/react';
import { EntryContextMenu, EntryMoreMenu, type MenuItem } from '../../components/common/EntryMenu';
import { cn } from '../../lib/cn';
import type { Entry, SortDir, SortKey, TransferMode } from '../../lib/entries';
import { kindLabel } from '../../lib/fileKind';
import { formatBytes, formatDate, formatRelativeDate } from '../../lib/formatters';
import { FileIcon, FolderIcon } from './FileIcon';

export type ViewMode = 'grid' | 'list';

export interface EntryHandlers {
  onOpenFolder: (prefix: string) => void;
  onSelectFile: (id: string) => void;
  onDownload: (key: string, name: string) => void;
  onDelete: (entry: Entry) => void;
  onTransfer: (entry: Entry, mode: TransferMode) => void;
}

interface FileBrowserProps extends EntryHandlers {
  entries: Entry[];
  view: ViewMode;
  selectedId: string | null;
  sort: { key: SortKey; dir: SortDir };
  onSortChange: (key: SortKey) => void;
}

function menuFor(entry: Entry, h: EntryHandlers): MenuItem[] {
  const organize: MenuItem[] = [
    { label: 'Rename', icon: Pencil, separatorBefore: true, onSelect: () => h.onTransfer(entry, 'rename') },
    { label: 'Move to…', icon: FolderInput, onSelect: () => h.onTransfer(entry, 'move') },
    { label: 'Copy to…', icon: Copy, onSelect: () => h.onTransfer(entry, 'copy') },
  ];
  if (entry.type === 'folder') {
    return [
      { label: 'Open', icon: FolderOpen, onSelect: () => h.onOpenFolder(entry.folder.prefix) },
      ...organize,
      { label: 'Delete folder', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
    ];
  }
  return [
    { label: 'Details', icon: Info, onSelect: () => h.onSelectFile(entry.id) },
    { label: 'Download', icon: Download, onSelect: () => h.onDownload(entry.file.key, entry.name) },
    ...organize,
    { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
  ];
}

function activate(entry: Entry, h: EntryHandlers) {
  if (entry.type === 'folder') h.onOpenFolder(entry.folder.prefix);
  else h.onSelectFile(entry.id);
}

function GridView({ entries, selectedId, ...h }: Omit<FileBrowserProps, 'view' | 'sort' | 'onSortChange'>) {
  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3 p-5">
      {entries.map((entry, i) => {
        const items = menuFor(entry, h);
        const selected = entry.id === selectedId;
        return (
          <EntryContextMenu key={entry.id} items={items}>
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.22, delay: Math.min(i * 0.015, 0.2) }}
              className={cn(
                'group relative rounded-2xl border bg-surface transition',
                selected
                  ? 'border-accent bg-accent-soft shadow-card'
                  : 'border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card',
              )}
            >
              <button
                type="button"
                onClick={() => activate(entry, h)}
                onDoubleClick={() => entry.type === 'file' && h.onDownload(entry.file.key, entry.name)}
                aria-pressed={entry.type === 'file' ? selected : undefined}
                className="flex w-full flex-col items-start rounded-2xl p-4 text-left"
              >
                <span className="mb-5">
                  {entry.type === 'folder' ? <FolderIcon size="md" /> : <FileIcon file={entry.file} size="md" />}
                </span>
                <span className="w-full truncate text-sm font-medium text-ink" title={entry.name}>
                  {entry.name}
                </span>
                <span className="mt-0.5 text-xs text-ink-3">
                  {entry.type === 'folder' ? 'Folder' : `${formatBytes(entry.file.size, 1)} · ${kindLabel(entry.file)}`}
                </span>
              </button>
              <div className="absolute right-2 top-2 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
                <EntryMoreMenu items={items} label={entry.name} />
              </div>
            </motion.div>
          </EntryContextMenu>
        );
      })}
    </div>
  );
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSortChange,
  className,
}: {
  label: string;
  sortKey: SortKey;
  sort: FileBrowserProps['sort'];
  onSortChange: (key: SortKey) => void;
  className?: string;
}) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-2.5 font-medium', className)}
    >
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className={cn('inline-flex items-center gap-1 transition hover:text-ink', active && 'text-ink')}
      >
        {label}
        {active && <Arrow className="size-3" />}
      </button>
    </th>
  );
}

function ListView({ entries, selectedId, sort, onSortChange, ...h }: Omit<FileBrowserProps, 'view'>) {
  return (
    <table className="w-full table-fixed border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-canvas/90 text-left text-xs uppercase tracking-wider text-ink-3 backdrop-blur">
        <tr className="border-b border-line">
          <SortHeader label="Name" sortKey="name" sort={sort} onSortChange={onSortChange} className="pl-6" />
          <SortHeader label="Modified" sortKey="modified" sort={sort} onSortChange={onSortChange} className="hidden w-44 md:table-cell" />
          <SortHeader label="Size" sortKey="size" sort={sort} onSortChange={onSortChange} className="hidden w-28 sm:table-cell" />
          <th scope="col" className="w-14 px-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => {
          const items = menuFor(entry, h);
          const selected = entry.id === selectedId;
          return (
            <EntryContextMenu key={entry.id} items={items}>
              <motion.tr
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 0.2, delay: Math.min(i * 0.012, 0.15) }}
                className={cn(
                  'group border-b border-line/60 transition',
                  selected ? 'bg-accent-soft' : 'hover:bg-surface',
                )}
              >
                <td className="py-1.5 pl-6 pr-4">
                  <button
                    type="button"
                    onClick={() => activate(entry, h)}
                    onDoubleClick={() => entry.type === 'file' && h.onDownload(entry.file.key, entry.name)}
                    className="flex w-full min-w-0 items-center gap-3 rounded-lg py-1 text-left"
                  >
                    {entry.type === 'folder' ? <FolderIcon size="sm" /> : <FileIcon file={entry.file} size="sm" />}
                    <span className="truncate font-medium text-ink" title={entry.name}>
                      {entry.name}
                    </span>
                  </button>
                </td>
                <td className="hidden px-4 text-ink-3 md:table-cell" title={entry.type === 'file' ? formatDate(entry.file.last_modified) : undefined}>
                  {entry.type === 'file' ? formatRelativeDate(entry.file.last_modified) : '—'}
                </td>
                <td className="hidden px-4 font-mono text-xs text-ink-3 sm:table-cell">
                  {entry.type === 'file' ? formatBytes(entry.file.size, 1) : '—'}
                </td>
                <td className="px-2 text-right">
                  <div className="opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
                    <EntryMoreMenu items={items} label={entry.name} />
                  </div>
                </td>
              </motion.tr>
            </EntryContextMenu>
          );
        })}
      </tbody>
    </table>
  );
}

export function FileBrowser({ view, ...props }: FileBrowserProps) {
  return view === 'grid' ? <GridView {...props} /> : <ListView {...props} />;
}
