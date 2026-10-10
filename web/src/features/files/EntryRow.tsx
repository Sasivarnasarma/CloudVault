import { EntryContextMenu, EntryMoreMenu } from '../../components/common/EntryMenu';
import { Checkbox } from '../../components/common/Checkbox';
import { Spinner } from '../../components/common/Spinner';
import { cn } from '../../lib/cn';
import { formatBytes, formatDate, formatRelativeDate } from '../../lib/formatters';
import type { EntryItemProps } from './browserTypes';
import { handleClick, handleDoubleClick, menuFor } from './entryInteractions';
import { FileIcon, FolderIcon } from './FileIcon';
import { useEntryDnd } from './useEntryDnd';

/** One file or folder as a row of the table in the list view. */
export function EntryRow({ entry, index, selected, selection, handlers: h, drag, tabStop, cut }: EntryItemProps) {
  const items = menuFor(entry, h);
  const dnd = useEntryDnd(entry, selection, drag);

  return (
    <EntryContextMenu items={items}>
      <tr
        {...dnd.dragProps}
        {...dnd.dropHandlers}
        data-entry-id={entry.id}
        aria-selected={selected}
        style={{ animationDelay: `${Math.min(index * 12, 150)}ms` }}
        className={cn(
          'group select-none border-b border-line/60 transition animate-fade',
          selected ? 'bg-accent-soft' : 'hover:bg-surface',
          (dnd.dragging || cut) && 'opacity-40',
          dnd.busy && 'pointer-events-none opacity-60',
          dnd.over && 'bg-accent-soft outline-2 -outline-offset-2 outline-accent',
        )}
        aria-busy={dnd.busy || undefined}
      >
        <td className="pl-5">
          <Checkbox
            checked={selected}
            label={`Select ${entry.name}`}
            onChange={() => h.onToggleSelect(entry.id)}
            tabbable={tabStop}
            className={cn(
              !selected && selection.size === 0 && 'opacity-0 focus-visible:opacity-100 group-hover:opacity-100',
            )}
          />
        </td>
        <td className="py-1.5 pl-2 pr-4">
          <button
            type="button"
            data-entry-main
            tabIndex={tabStop ? 0 : -1}
            onClick={(e) => handleClick(e, entry, h)}
            onDoubleClick={(e) => handleDoubleClick(e, entry, h)}
            className="flex w-full min-w-0 scroll-mt-12 items-center gap-3 rounded-lg py-1 text-left"
          >
            {entry.type === 'folder' ? <FolderIcon size="sm" /> : <FileIcon file={entry.file} size="sm" />}
            <span className="truncate font-medium text-ink" title={entry.name}>
              {entry.name}
            </span>
          </button>
        </td>
        <td
          className="hidden px-4 text-ink-3 md:table-cell"
          title={entry.type === 'file' ? formatDate(entry.file.last_modified) : undefined}
        >
          {entry.type === 'file' ? formatRelativeDate(entry.file.last_modified) : '—'}
        </td>
        <td className="hidden px-4 font-mono text-xs text-ink-3 sm:table-cell">
          {entry.type === 'file' ? formatBytes(entry.file.size, 1) : '—'}
        </td>
        <td className="px-2 text-right">
          {dnd.busy ? (
            <span
              role="status"
              aria-label={`Moving ${entry.name}`}
              className="inline-flex size-8 items-center justify-center text-accent"
            >
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
