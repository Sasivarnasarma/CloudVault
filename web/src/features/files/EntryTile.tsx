import { EntryContextMenu, EntryMoreMenu } from '../../components/common/EntryMenu';
import { Checkbox } from '../../components/common/Checkbox';
import { Spinner } from '../../components/common/Spinner';
import { cn } from '../../lib/cn';
import { kindLabel } from '../../lib/fileKind';
import { formatBytes } from '../../lib/formatters';
import type { EntryItemProps } from './browserTypes';
import { handleClick, handleDoubleClick, menuFor } from './entryInteractions';
import { FileIcon, FolderIcon } from './FileIcon';
import { useEntryDnd } from './useEntryDnd';

/** One file or folder as a card in the grid view. */
export function EntryTile({ entry, index, selected, selection, handlers: h, drag, tabStop, cut }: EntryItemProps) {
  const items = menuFor(entry, h);
  const dnd = useEntryDnd(entry, selection, drag);
  const anySelected = selection.size > 0;

  return (
    <EntryContextMenu items={items}>
      <div
        {...dnd.dragProps}
        {...dnd.dropHandlers}
        role="listitem"
        data-entry-id={entry.id}
        style={{ animationDelay: `${Math.min(index * 15, 200)}ms` }}
        className={cn(
          'group relative select-none rounded-2xl border bg-surface transition animate-rise [contain-intrinsic-size:auto_9rem] [content-visibility:auto]',
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
          aria-pressed={selected}
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
          <Checkbox
            checked={selected}
            label={`Select ${entry.name}`}
            onChange={() => h.onToggleSelect(entry.id)}
            tabbable={tabStop}
          />
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
