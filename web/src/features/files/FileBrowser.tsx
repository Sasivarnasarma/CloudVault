import {
  ArrowDown,
  ArrowUp,
  Check,
  Copy,
  Download,
  FolderInput,
  FolderOpen,
  Info,
  Minus,
  Pencil,
  Trash2,
} from 'lucide-react';
import { useCallback, useRef, type DragEvent, type MouseEvent } from 'react';
import { Spinner } from '../../components/common/Spinner';
import { EntryContextMenu, EntryMoreMenu, type MenuItem } from '../../components/common/EntryMenu';
import { cn } from '../../lib/cn';
import { setEntryDrag } from '../../lib/dragMove';
import type { Entry, SortDir, SortKey, TransferMode } from '../../lib/entries';
import { kindLabel } from '../../lib/fileKind';
import { formatBytes, formatDate, formatRelativeDate } from '../../lib/formatters';
import { FileIcon, FolderIcon } from './FileIcon';
import { useDropTarget } from '../../hooks/useDropTarget';
import { useEntryNavigation } from './useEntryNavigation';

export type ViewMode = 'grid' | 'list';

export interface EntryHandlers {
  onOpenFolder: (prefix: string) => void;
  /** Plain click, arrow keys, "Details": select just this item (a file then shows its details). */
  onChoose: (id: string) => void;
  /** Checkbox or Ctrl/Cmd+click: add or remove one item from the selection. */
  onToggleSelect: (id: string) => void;
  /** Shift+click / Shift+arrows: select everything between the last chosen item and this one. */
  onSelectRange: (id: string, from?: string) => void;
  onDownload: (key: string, name: string) => void;
  onDelete: (entry: Entry) => void;
  onTransfer: (entry: Entry, mode: TransferMode) => void;
}

export interface DragHandlers {
  /** Ids of the entries being dragged right now, or null when nothing is. */
  dragIds: readonly string[] | null;
  /** Ids of entries that are being moved right now; they show a spinner and can't be dragged again. */
  busyIds?: readonly string[];
  onDragStart: (ids: string[]) => void;
  onDragEnd: () => void;
  /** The dragged entries were dropped on this folder. */
  onDropOnFolder: (prefix: string) => void;
}

interface FileBrowserProps extends EntryHandlers, DragHandlers {
  entries: Entry[];
  view: ViewMode;
  selection: ReadonlySet<string>;
  sort: { key: SortKey; dir: SortDir };
  onSortChange: (key: SortKey) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  /** Ids of entries on the clipboard to be moved (Ctrl+X): shown faded until they are pasted. */
  cutIds?: readonly string[];
  /** Keyboard: go to the parent folder. */
  onGoUp: () => void;
  /** Keyboard: the cursor reached the last loaded item, so the next page can be loaded. */
  onReachEnd?: () => void;
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
    { label: 'Details', icon: Info, onSelect: () => h.onChoose(entry.id) },
    { label: 'Download', icon: Download, onSelect: () => h.onDownload(entry.file.key, entry.name) },
    ...organize,
    { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
  ];
}

/** Touch screens have no double-click, so there a tap on a folder opens it. */
const tapOpensFolders = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Click on an entry, like a desktop file manager: modifiers extend the selection, otherwise select it. */
function handleClick(e: MouseEvent, entry: Entry, h: EntryHandlers) {
  if (e.shiftKey) h.onSelectRange(entry.id);
  else if (e.ctrlKey || e.metaKey) h.onToggleSelect(entry.id);
  else if (entry.type === 'folder' && tapOpensFolders()) h.onOpenFolder(entry.folder.prefix);
  else h.onChoose(entry.id);
}

/** Double-click opens a folder or downloads a file. */
function handleDoubleClick(e: MouseEvent, entry: Entry, h: EntryHandlers) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) return;
  if (entry.type === 'folder') h.onOpenFolder(entry.folder.prefix);
  else h.onDownload(entry.file.key, entry.name);
}

/** Drag source + (for folders) drop target behaviour of one entry. */
function useEntryDnd(entry: Entry, selection: ReadonlySet<string>, d: DragHandlers) {
  const dragging = d.dragIds?.includes(entry.id) ?? false;
  const busy = d.busyIds?.includes(entry.id) ?? false;
  // A folder accepts drops of anything except itself.
  const accepts = entry.type === 'folder' && d.dragIds !== null && !dragging;
  const drop = useDropTarget({
    enabled: accepts,
    onDrop: () => entry.type === 'folder' && d.onDropOnFolder(entry.folder.prefix),
  });

  const dragProps = {
    draggable: !busy,
    onDragStart: (e: DragEvent) => {
      // Dragging part of a multi-selection moves the whole selection; otherwise just this item.
      const ids = selection.has(entry.id) ? [...selection] : [entry.id];
      setEntryDrag(e, ids);
      d.onDragStart(ids);
    },
    onDragEnd: d.onDragEnd,
  };

  return { dragging, busy, over: drop.over, dropHandlers: drop.handlers, dragProps };
}

function SelectBox({
  checked,
  indeterminate = false,
  label,
  onChange,
  className,
  tabbable = true,
}: {
  checked: boolean;
  indeterminate?: boolean;
  label: string;
  onChange: () => void;
  className?: string;
  tabbable?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={tabbable ? undefined : -1}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition',
        checked || indeterminate
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line-strong bg-surface-2 text-transparent hover:border-accent',
        className,
      )}
    >
      {indeterminate ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

interface ItemProps {
  entry: Entry;
  index: number;
  selected: boolean;
  selection: ReadonlySet<string>;
  handlers: EntryHandlers;
  drag: DragHandlers;
  /** The keyboard cursor is on this item: it is the one tab stop of the list. */
  tabStop: boolean;
  /** The item was cut and is waiting to be pasted. */
  cut: boolean;
}

function GridTile({ entry, index, selected, selection, handlers: h, drag, tabStop, cut }: ItemProps) {
  const items = menuFor(entry, h);
  const dnd = useEntryDnd(entry, selection, drag);
  const anySelected = selection.size > 0;

  return (
    <EntryContextMenu items={items}>
      <div
        {...dnd.dragProps}
        {...dnd.dropHandlers}
        data-entry-id={entry.id}
        style={{ animationDelay: `${Math.min(index * 15, 200)}ms` }}
        className={cn(
          'group relative select-none rounded-2xl border bg-surface transition [animation:cv-rise_0.22s_ease-out_backwards] [contain-intrinsic-size:auto_9rem] [content-visibility:auto]',
          selected
            ? 'border-accent bg-accent-soft shadow-card'
            : 'border-line hover:-translate-y-0.5 hover:border-line-strong hover:shadow-card',
          (dnd.dragging || cut) && 'opacity-40',
          dnd.busy && 'pointer-events-none',
          dnd.over && 'border-accent bg-accent-soft ring-2 ring-accent',
        )}
        aria-busy={dnd.busy || undefined}
      >
        <button
          type="button"
          data-entry-main
          tabIndex={tabStop ? 0 : -1}
          onClick={(e) => handleClick(e, entry, h)}
          onDoubleClick={(e) => handleDoubleClick(e, entry, h)}
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
        <div
          className={cn(
            'absolute left-2.5 top-2.5 transition focus-within:opacity-100 group-hover:opacity-100',
            selected || anySelected ? 'opacity-100' : 'opacity-0',
          )}
        >
          <SelectBox checked={selected} label={`Select ${entry.name}`} onChange={() => h.onToggleSelect(entry.id)} tabbable={tabStop} />
        </div>
        <div className="absolute right-2 top-2 opacity-0 transition focus-within:opacity-100 group-hover:opacity-100">
          <EntryMoreMenu items={items} label={entry.name} tabbable={tabStop} />
        </div>
        {dnd.busy && (
          <div
            role="status"
            aria-label={`Moving ${entry.name}`}
            className="absolute inset-0 grid place-items-center rounded-2xl bg-surface/70 text-accent backdrop-blur-[1px]"
          >
            <Spinner className="size-6" />
          </div>
        )}
      </div>
    </EntryContextMenu>
  );
}

function ListRow({ entry, index, selected, selection, handlers: h, drag, tabStop, cut }: ItemProps) {
  const items = menuFor(entry, h);
  const dnd = useEntryDnd(entry, selection, drag);

  return (
    <EntryContextMenu items={items}>
      <tr
        {...dnd.dragProps}
        {...dnd.dropHandlers}
        data-entry-id={entry.id}
        style={{ animationDelay: `${Math.min(index * 12, 150)}ms` }}
        className={cn(
          'group select-none border-b border-line/60 transition [animation:cv-fade_0.2s_ease-out_backwards]',
          selected ? 'bg-accent-soft' : 'hover:bg-surface',
          (dnd.dragging || cut) && 'opacity-40',
          dnd.busy && 'pointer-events-none opacity-60',
          dnd.over && 'bg-accent-soft outline outline-2 -outline-offset-2 outline-accent',
        )}
        aria-busy={dnd.busy || undefined}
      >
        <td className="pl-5">
          <SelectBox
            checked={selected}
            label={`Select ${entry.name}`}
            onChange={() => h.onToggleSelect(entry.id)}
            tabbable={tabStop}
            className={cn(!selected && selection.size === 0 && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100')}
          />
        </td>
        <td className="py-1.5 pl-2 pr-4">
          <button
            type="button"
            data-entry-main
            tabIndex={tabStop ? 0 : -1}
            onClick={(e) => handleClick(e, entry, h)}
            onDoubleClick={(e) => handleDoubleClick(e, entry, h)}
            aria-pressed={entry.type === 'file' ? selected : undefined}
            className="flex w-full min-w-0 scroll-mt-12 items-center gap-3 rounded-lg py-1 text-left"
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
          {dnd.busy ? (
            <span role="status" aria-label={`Moving ${entry.name}`} className="inline-flex size-8 items-center justify-center text-accent">
              <Spinner />
            </span>
          ) : (
            <div className="opacity-0 transition focus-within:opacity-100 group-hover:opacity-100 max-sm:opacity-100">
              <EntryMoreMenu items={items} label={entry.name} tabbable={tabStop} />
            </div>
          )}
        </td>
      </tr>
    </EntryContextMenu>
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

export function FileBrowser(props: FileBrowserProps) {
  const {
    entries,
    view,
    selection,
    sort,
    onSortChange,
    onSelectAll,
    onClearSelection,
    cutIds,
    onGoUp,
    onReachEnd,
    dragIds,
    busyIds,
    onDragStart,
    onDragEnd,
    onDropOnFolder,
    ...handlers
  } = props;
  const drag: DragHandlers = { dragIds, busyIds, onDragStart, onDragEnd, onDropOnFolder };

  const containerRef = useRef<HTMLElement | null>(null);
  const setContainer = useCallback((el: HTMLElement | null) => {
    containerRef.current = el;
  }, []);
  const nav = useEntryNavigation({
    entries,
    view,
    containerRef,
    onChoose: handlers.onChoose,
    onToggle: handlers.onToggleSelect,
    onExtend: handlers.onSelectRange,
    onOpenFolder: handlers.onOpenFolder,
    onGoUp,
    onReachEnd,
  });

  if (view === 'grid') {
    return (
      <div ref={setContainer} onFocus={nav.onFocus} className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3 p-5">
        {entries.map((entry, i) => (
          <GridTile
            key={entry.id}
            entry={entry}
            index={i}
            selected={selection.has(entry.id)}
            selection={selection}
            handlers={handlers}
            drag={drag}
            tabStop={entry.id === nav.tabStopId}
            cut={cutIds?.includes(entry.id) ?? false}
          />
        ))}
      </div>
    );
  }

  const selectedCount = entries.filter((e) => selection.has(e.id)).length;
  const allSelected = entries.length > 0 && selectedCount === entries.length;

  return (
    <table ref={setContainer} onFocus={nav.onFocus} className="w-full table-fixed border-collapse text-sm">
      <thead className="sticky top-0 z-10 bg-canvas/90 text-left text-xs uppercase tracking-wider text-ink-3 backdrop-blur">
        <tr className="border-b border-line">
          <th scope="col" className="w-12 pl-5">
            <SelectBox
              checked={allSelected}
              indeterminate={selectedCount > 0 && !allSelected}
              label="Select all"
              onChange={() => (allSelected || selectedCount > 0 ? onClearSelection() : onSelectAll())}
            />
          </th>
          <SortHeader label="Name" sortKey="name" sort={sort} onSortChange={onSortChange} className="pl-2" />
          <SortHeader label="Modified" sortKey="modified" sort={sort} onSortChange={onSortChange} className="hidden w-44 md:table-cell" />
          <SortHeader label="Size" sortKey="size" sort={sort} onSortChange={onSortChange} className="hidden w-28 sm:table-cell" />
          <th scope="col" className="w-14 px-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => (
          <ListRow
            key={entry.id}
            entry={entry}
            index={i}
            selected={selection.has(entry.id)}
            selection={selection}
            handlers={handlers}
            drag={drag}
            tabStop={entry.id === nav.tabStopId}
            cut={cutIds?.includes(entry.id) ?? false}
          />
        ))}
      </tbody>
    </table>
  );
}
