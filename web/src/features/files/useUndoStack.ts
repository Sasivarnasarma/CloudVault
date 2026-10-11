import { useCallback, useMemo, useRef } from 'react';

/** How many changes can be undone, one after the other. */
const MAX_UNDOABLE = 20;

interface UndoEntry {
  id: number;
  run: () => Promise<void>;
}

/**
 * The changes that can be undone: deleting, moving, renaming and pasting each add one. Ctrl+Z undoes
 * the latest; the "Undo" button on a toast undoes its own change, whenever it is clicked. The list is
 * only kept while the page stays open.
 */
export function useUndoStack() {
  const entries = useRef<UndoEntry[]>([]);
  const nextId = useRef(0);

  /** Remember how to undo a change. Returns an id for `undo`. */
  const push = useCallback((run: () => Promise<void>) => {
    const id = ++nextId.current;
    entries.current.push({ id, run });
    if (entries.current.length > MAX_UNDOABLE) entries.current.shift();
    return id;
  }, []);

  /** Undo one change, if it is still there to undo. */
  const undo = useCallback(async (id: number) => {
    const index = entries.current.findIndex((e) => e.id === id);
    if (index < 0) return;
    const [entry] = entries.current.splice(index, 1);
    await entry.run();
  }, []);

  /** Undo the latest change. Returns false when there is nothing to undo. */
  const undoLast = useCallback((): false | void => {
    const entry = entries.current.pop();
    if (!entry) return false;
    void entry.run();
  }, []);

  return useMemo(() => ({ push, undo, undoLast }), [push, undo, undoLast]);
}

export type UndoStack = ReturnType<typeof useUndoStack>;
