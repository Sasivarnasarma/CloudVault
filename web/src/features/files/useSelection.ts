import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Multi-selection over the entries currently shown.
 *
 * `orderedIds` is the visible order (used for shift-click ranges and select-all); anything that
 * stops being visible (search, filters, deletion) is dropped from the selection so bulk actions can
 * never touch items the user can no longer see. The selection also resets when `resetKey` changes
 * (moving to another folder).
 */
export function useSelection(orderedIds: string[], resetKey: string) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(() => new Set());
  const anchor = useRef<string | null>(null);

  useEffect(() => {
    setSelected(new Set());
    anchor.current = null;
  }, [resetKey]);

  useEffect(() => {
    setSelected((prev) => {
      if (prev.size === 0) return prev;
      const visible = new Set(orderedIds);
      const kept = [...prev].filter((id) => visible.has(id));
      return kept.length === prev.size ? prev : new Set(kept);
    });
  }, [orderedIds]);

  /** Add or remove one item (checkbox, Ctrl/Cmd+click). */
  const toggle = useCallback((id: string) => {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
    anchor.current = id;
  }, []);

  /** Select just this item (click, arrow keys); an item that is already the only one stays selected. */
  const choose = useCallback((id: string) => {
    setSelected((prev) => (prev.size === 1 && prev.has(id) ? prev : new Set([id])));
    anchor.current = id;
  }, []);

  /** Select everything between the last clicked item and this one (Shift+click). */
  const selectRange = useCallback(
    (id: string) => {
      const to = orderedIds.indexOf(id);
      if (to === -1) return;
      const from = anchor.current ? orderedIds.indexOf(anchor.current) : -1;
      const start = from === -1 ? to : Math.min(from, to);
      const end = from === -1 ? to : Math.max(from, to);
      setSelected(new Set(orderedIds.slice(start, end + 1)));
      if (from === -1) anchor.current = id;
    },
    [orderedIds],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedIds));
  }, [orderedIds]);

  const clear = useCallback(() => {
    setSelected(new Set());
    anchor.current = null;
  }, []);

  /** Drop specific items from the selection (e.g. after they were moved or deleted). */
  const remove = useCallback((ids: string[]) => {
    setSelected((prev) => {
      if (!ids.some((id) => prev.has(id))) return prev;
      const next = new Set(prev);
      ids.forEach((id) => next.delete(id));
      return next;
    });
  }, []);

  /** Replace the selection with these items, ignoring any that are not shown. */
  const replace = useCallback(
    (ids: string[]) => {
      const visible = new Set(orderedIds);
      setSelected(new Set(ids.filter((id) => visible.has(id))));
    },
    [orderedIds],
  );

  return { selected, toggle, choose, selectRange, selectAll, clear, remove, replace };
}
