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

  /**
   * Select everything between the last clicked item and this one (Shift+click, Shift+arrows).
   * `fallback` is where the range begins when nothing has been clicked or chosen yet.
   */
  const selectRange = useCallback(
    (id: string, fallback?: string) => {
      const to = orderedIds.indexOf(id);
      if (to === -1) return;
      const origin = anchor.current ?? fallback ?? null;
      const from = origin ? orderedIds.indexOf(origin) : -1;
      const start = from === -1 ? to : Math.min(from, to);
      const end = from === -1 ? to : Math.max(from, to);
      setSelected(new Set(orderedIds.slice(start, end + 1)));
      if (from === -1) anchor.current = id;
      else if (anchor.current === null) anchor.current = origin;
    },
    [orderedIds],
  );

  const selectAll = useCallback(() => {
    setSelected(new Set(orderedIds));
  }, [orderedIds]);

  /** Select what is not selected and deselect what is (Ctrl+I). */
  const invert = useCallback(() => {
    setSelected((prev) => new Set(orderedIds.filter((id) => !prev.has(id))));
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

  return { selected, toggle, choose, selectRange, selectAll, invert, clear, remove, replace };
}
