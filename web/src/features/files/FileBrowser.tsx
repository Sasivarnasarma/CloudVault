import { useCallback, useRef } from 'react';
import type { Entry, SortKey } from '../../lib/entries';
import type { DragHandlers, EntryHandlers, SortState, ViewMode } from './browserTypes';
import { FileGrid } from './FileGrid';
import { FileTable } from './FileTable';
import { useEntryNavigation } from './useEntryNavigation';

export type { DragHandlers, EntryHandlers, ViewMode } from './browserTypes';

interface FileBrowserProps extends EntryHandlers, DragHandlers {
  entries: Entry[];
  view: ViewMode;
  selection: ReadonlySet<string>;
  sort: SortState;
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

/** The folder's entries as a grid of cards or a table, with mouse and keyboard interaction. */
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
    onPreview: handlers.onPreview,
    onGoUp,
    onReachEnd,
  });

  const shared = { entries, selection, handlers, drag, cutIds, tabStopId: nav.tabStopId };

  return view === 'grid' ? (
    <FileGrid {...shared} containerRef={setContainer} onFocus={nav.onFocus} onBlur={nav.onBlur} />
  ) : (
    <FileTable
      {...shared}
      sort={sort}
      onSortChange={onSortChange}
      onSelectAll={onSelectAll}
      onClearSelection={onClearSelection}
      containerRef={setContainer}
      onFocus={nav.onFocus}
      onBlur={nav.onBlur}
    />
  );
}
