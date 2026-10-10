import type { FocusEventHandler } from 'react';
import type { EntryViewProps } from './browserTypes';
import { EntryTile } from './EntryTile';

interface FileGridProps extends EntryViewProps {
  containerRef: (el: HTMLElement | null) => void;
  onFocus: FocusEventHandler<HTMLElement>;
  onBlur: FocusEventHandler<HTMLElement>;
}

/** The entries as cards in a responsive grid. */
export function FileGrid({
  entries,
  selection,
  handlers,
  drag,
  cutIds,
  tabStopId,
  containerRef,
  onFocus,
  onBlur,
}: FileGridProps) {
  return (
    <div
      ref={containerRef}
      onFocus={onFocus}
      onBlur={onBlur}
      role="list"
      aria-label="Files and folders"
      className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3 p-5"
    >
      {entries.map((entry, i) => (
        <EntryTile
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
    </div>
  );
}
