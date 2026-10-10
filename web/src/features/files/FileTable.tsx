import type { FocusEventHandler } from 'react';
import { Checkbox } from '../../components/common/Checkbox';
import type { SortKey } from '../../lib/entries';
import type { EntryViewProps, SortState } from './browserTypes';
import { EntryRow } from './EntryRow';
import { SortHeader } from './SortHeader';

interface FileTableProps extends EntryViewProps {
  sort: SortState;
  onSortChange: (key: SortKey) => void;
  onSelectAll: () => void;
  onClearSelection: () => void;
  containerRef: (el: HTMLElement | null) => void;
  onFocus: FocusEventHandler<HTMLElement>;
  onBlur: FocusEventHandler<HTMLElement>;
}

/** The entries as rows of a table with sortable columns and a "select all" box. */
export function FileTable({
  entries,
  selection,
  handlers,
  drag,
  cutIds,
  tabStopId,
  sort,
  onSortChange,
  onSelectAll,
  onClearSelection,
  containerRef,
  onFocus,
  onBlur,
}: FileTableProps) {
  const selectedCount = entries.filter((e) => selection.has(e.id)).length;
  const allSelected = entries.length > 0 && selectedCount === entries.length;

  return (
    <table
      ref={containerRef}
      onFocus={onFocus}
      onBlur={onBlur}
      role="grid"
      aria-label="Files and folders"
      aria-multiselectable="true"
      className="w-full table-fixed border-collapse text-sm"
    >
      <thead className="sticky top-0 z-10 bg-canvas/90 text-left text-xs uppercase tracking-wider text-ink-3 backdrop-blur">
        <tr className="border-b border-line">
          <th scope="col" className="w-12 pl-5">
            <Checkbox
              checked={allSelected}
              indeterminate={selectedCount > 0 && !allSelected}
              label="Select all"
              onChange={() => (allSelected || selectedCount > 0 ? onClearSelection() : onSelectAll())}
            />
          </th>
          <SortHeader label="Name" sortKey="name" sort={sort} onSortChange={onSortChange} className="pl-2" />
          <SortHeader
            label="Modified"
            sortKey="modified"
            sort={sort}
            onSortChange={onSortChange}
            className="hidden w-44 md:table-cell"
          />
          <SortHeader
            label="Size"
            sortKey="size"
            sort={sort}
            onSortChange={onSortChange}
            className="hidden w-28 sm:table-cell"
          />
          <th scope="col" className="w-14 px-2">
            <span className="sr-only">Actions</span>
          </th>
        </tr>
      </thead>
      <tbody>
        {entries.map((entry, i) => (
          <EntryRow
            key={entry.id}
            entry={entry}
            index={i}
            selected={selection.has(entry.id)}
            selection={selection}
            handlers={handlers}
            drag={drag}
            tabStop={entry.id === tabStopId}
            cut={cutIds?.includes(entry.id) ?? false}
          />
        ))}
      </tbody>
    </table>
  );
}
