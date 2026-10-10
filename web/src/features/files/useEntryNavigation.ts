import { useCallback, useEffect, useRef, useState, type FocusEvent, type RefObject } from 'react';
import type { Entry } from '../../lib/entries';
import { extendTypeAhead, isNavKey, isTypeAheadChar, nextIndex, typeAheadMatch, type TypeAhead } from '../../lib/listNav';

interface Options {
  entries: Entry[];
  view: 'grid' | 'list';
  /** The element that holds every item (the grid, or the table). */
  containerRef: RefObject<HTMLElement | null>;
  /** Select just this item (without toggling it off), e.g. when the arrow keys land on it. */
  onChoose: (id: string) => void;
  /** Add or remove one item from the selection (Ctrl+Space). */
  onToggle: (id: string) => void;
  /** Select everything between the anchor and this item (Shift+arrows); `from` is used if there is no anchor yet. */
  onExtend: (id: string, from?: string) => void;
  onOpenFolder: (prefix: string) => void;
  onGoUp: () => void;
  /** The cursor reached the last loaded item: a chance to load the next page. */
  onReachEnd?: () => void;
}

interface Cursor {
  id: string;
  index: number;
}

const ITEM = '[data-entry-id]';
const ITEM_MAIN = '[data-entry-main]';

function findItem(root: HTMLElement, id: string): HTMLElement | undefined {
  return Array.from(root.querySelectorAll<HTMLElement>(ITEM)).find((el) => el.dataset.entryId === id);
}

function gridColumns(root: HTMLElement): number {
  const tracks = window.getComputedStyle(root).gridTemplateColumns.split(' ').filter(Boolean);
  return Math.max(1, tracks.length);
}

function scrollParent(el: HTMLElement): HTMLElement | null {
  for (let node = el.parentElement; node; node = node.parentElement) {
    const overflow = window.getComputedStyle(node).overflowY;
    if (overflow === 'auto' || overflow === 'scroll') return node;
  }
  return null;
}

/** Items that fit on screen, so PageUp / PageDown move about one screenful. */
function pageSize(root: HTMLElement, columns: number): number {
  const itemHeight = root.querySelector<HTMLElement>(ITEM)?.getBoundingClientRect().height ?? 0;
  const viewport = scrollParent(root)?.clientHeight || window.innerHeight;
  const rows = itemHeight > 0 ? Math.max(1, Math.floor(viewport / itemHeight)) : 10;
  return rows * columns;
}

/**
 * Explorer-style keyboard navigation over the entries.
 *
 * One item is the "cursor" and is the only tab stop (roving tabindex), so Tab goes into the list
 * once and out again instead of through every row. Arrow keys / Home / End / PageUp / PageDown move
 * the cursor and select the item they land on; with Shift they extend the selection from where it
 * started, with Ctrl they move the cursor alone (Space or Ctrl+Space then selects or toggles it);
 * typing letters jumps to a name; Enter opens a folder or shows a file's details. The keys also work when nothing is focused (after clicking empty
 * space or closing a dialog), but never while typing, in a dialog or while a menu is open.
 */
export function useEntryNavigation(options: Options) {
  const { entries } = options;
  const [cursor, setCursor] = useState<Cursor | null>(null);
  const typed = useRef<TypeAhead>({ query: '', at: 0 });

  // Where the cursor is now: its item if it still exists, otherwise the nearest position.
  const found = cursor ? entries.findIndex((e) => e.id === cursor.id) : -1;
  const cursorIndex = entries.length === 0 ? -1 : found !== -1 ? found : Math.min(cursor?.index ?? 0, entries.length - 1);
  const tabStopId = cursorIndex === -1 ? null : entries[cursorIndex].id;

  const latest = useRef({ options, cursor, cursorIndex });
  useEffect(() => {
    latest.current = { options, cursor, cursorIndex };
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const { options: o, cursor: c, cursorIndex: current } = latest.current;
      const root = o.containerRef.current;
      if (!root || e.defaultPrevented || e.isComposing || o.entries.length === 0) return;

      const target = e.target as HTMLElement | null;
      const onItem = !!target?.matches?.(ITEM_MAIN) && root.contains(target);
      if (!onItem && target !== document.body) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;

      const goTo = (index: number, mode: 'select' | 'extend' | 'move' = 'select') => {
        const entry = o.entries[index];
        e.preventDefault();
        setCursor({ id: entry.id, index });
        if (mode === 'select') o.onChoose(entry.id);
        else if (mode === 'extend') o.onExtend(entry.id, o.entries[current]?.id);
        findItem(root, entry.id)?.querySelector<HTMLElement>(ITEM_MAIN)?.focus();
        if (index === o.entries.length - 1) o.onReachEnd?.();
      };

      if (e.key === 'Enter' && onItem && !e.ctrlKey && !e.metaKey && !e.altKey && !e.shiftKey) {
        const entry = o.entries[current];
        e.preventDefault();
        if (entry.type === 'folder') o.onOpenFolder(entry.folder.prefix);
        else o.onChoose(entry.id);
        return;
      }

      if (e.altKey) return;
      const mod = e.ctrlKey || e.metaKey;

      if (e.key === ' ' && onItem && !e.shiftKey) {
        e.preventDefault();
        const entry = o.entries[current];
        if (mod) o.onToggle(entry.id);
        else o.onChoose(entry.id);
        return;
      }

      if (!mod && isTypeAheadChar(e)) {
        typed.current = extendTypeAhead(typed.current, e.key, Date.now());
        const match = typeAheadMatch(
          o.entries.map((x) => x.name),
          typed.current.query,
          c ? current : -1,
        );
        if (match !== -1) goTo(match);
        return;
      }

      if (!isNavKey(e.key) || (mod && e.shiftKey)) return;
      const mode = mod ? 'move' : e.shiftKey ? 'extend' : 'select';

      // In the list the left/right arrows go up a folder / into the folder under the cursor.
      if (o.view === 'list' && (e.key === 'ArrowLeft' || e.key === 'ArrowRight')) {
        if (mode !== 'select') return;
        e.preventDefault();
        if (e.key === 'ArrowLeft') o.onGoUp();
        else {
          const entry = o.entries[current];
          if (c && entry.type === 'folder') o.onOpenFolder(entry.folder.prefix);
        }
        return;
      }

      // Nothing has been focused yet: the first key lands on the first item (or the last, for End).
      if (!onItem && !c) {
        goTo(e.key === 'End' ? o.entries.length - 1 : 0, mode);
        return;
      }

      const columns = o.view === 'grid' ? gridColumns(root) : 1;
      const next = nextIndex(e.key, current, o.entries.length, { columns, pageSize: pageSize(root, columns) });
      if (next !== null) goTo(next, mode);
    };

    // Space on a button clicks it when released (Firefox even after keydown was cancelled).
    const onKeyUp = (e: KeyboardEvent) => {
      const root = latest.current.options.containerRef.current;
      const target = e.target as HTMLElement | null;
      if (e.key === ' ' && root && target?.matches?.(ITEM_MAIN) && root.contains(target)) e.preventDefault();
    };

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    return () => {
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
    };
  }, []);

  /** Focus moving onto an item (by mouse or Tab) makes it the cursor. */
  const onFocus = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      const row = (e.target as HTMLElement).closest<HTMLElement>(ITEM);
      const id = row?.dataset.entryId;
      if (!id || cursor?.id === id) return;
      setCursor({ id, index: entries.findIndex((x) => x.id === id) });
    },
    [cursor, entries],
  );

  return { tabStopId, onFocus };
}
