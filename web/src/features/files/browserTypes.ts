import type { Entry, SortDir, SortKey, TransferMode } from '../../lib/entries';

export type ViewMode = 'grid' | 'list';

export interface SortState {
  key: SortKey;
  dir: SortDir;
}

/** What can be done with one entry, from its tile or row. */
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

/** Dragging entries onto folders to move them. */
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

/** Props of one tile (grid view) or row (list view). */
export interface EntryItemProps {
  entry: Entry;
  /** Position in the list, used to stagger the entrance animation. */
  index: number;
  selected: boolean;
  /** Everything selected, so dragging one selected item drags them all. */
  selection: ReadonlySet<string>;
  handlers: EntryHandlers;
  drag: DragHandlers;
  /** The keyboard cursor is on this item: it is the one tab stop of the list. */
  tabStop: boolean;
  /** The item was cut and is waiting to be pasted. */
  cut: boolean;
}

/** What the grid and the table need from `FileBrowser` to show the entries. */
export interface EntryViewProps {
  entries: Entry[];
  selection: ReadonlySet<string>;
  handlers: EntryHandlers;
  drag: DragHandlers;
  cutIds?: readonly string[];
  /** The entry that is the one tab stop. */
  tabStopId: string | null;
}
