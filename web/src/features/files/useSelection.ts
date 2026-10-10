import { useCallback, useState } from 'react';

interface State {
  /** The folder the selection belongs to. */
  key: string;
  selected: ReadonlySet<string>;
  /** Where a Shift range starts: the last item that was clicked or chosen. */
  anchor: string | null;
}

/**
 * Multi-selection over the entries currently shown.
 *
 * `orderedIds` is the visible order (used for shift-click ranges and select-all). Anything that stops
 * being visible (search, filters, deletion) is dropped from the selection so bulk actions can never
 * touch items the user can no longer see, and the selection starts over when `resetKey` changes
 * (moving to another folder).
 */
export function useSelection(orderedIds: string[], resetKey: string) {
  const [state, setState] = useState<State>(() => ({ key: resetKey, selected: new Set(), anchor: null }));

  // Keep the state in step with the props while rendering (instead of fixing it up in an effect,
  // which would render the stale selection first).
  let current = state;
  if (state.key !== resetKey) {
    current = { key: resetKey, selected: new Set(), anchor: null };
  } else if (state.selected.size > 0) {
    const visible = new Set(orderedIds);
    const kept = [...state.selected].filter((id) => visible.has(id));
    if (kept.length !== state.selected.size) current = { ...state, selected: new Set(kept) };
  }
  if (current !== state) setState(current);

  const update = useCallback((change: (prev: State) => Partial<State>) => {
    setState((prev) => {
      const patch = change(prev);
      return Object.keys(patch).length === 0 ? prev : { ...prev, ...patch };
    });
  }, []);

  /** Add or remove one item (checkbox, Ctrl/Cmd+click). */
  const toggle = useCallback(
    (id: string) =>
      update((prev) => {
        const next = new Set(prev.selected);
        if (next.has(id)) next.delete(id);
        else next.add(id);
        return { selected: next, anchor: id };
      }),
    [update],
  );

  /** Select just this item (click, arrow keys); an item that is already the only one stays selected. */
  const choose = useCallback(
    (id: string) =>
      update((prev) => ({
        selected: prev.selected.size === 1 && prev.selected.has(id) ? prev.selected : new Set([id]),
        anchor: id,
      })),
    [update],
  );

  /**
   * Select everything between the last clicked item and this one (Shift+click, Shift+arrows).
   * `fallback` is where the range begins when nothing has been clicked or chosen yet.
   */
  const selectRange = useCallback(
    (id: string, fallback?: string) =>
      update((prev) => {
        const to = orderedIds.indexOf(id);
        if (to === -1) return {};
        const origin = prev.anchor ?? fallback ?? null;
        const from = origin ? orderedIds.indexOf(origin) : -1;
        const start = from === -1 ? to : Math.min(from, to);
        const end = from === -1 ? to : Math.max(from, to);
        return {
          selected: new Set(orderedIds.slice(start, end + 1)),
          anchor: from === -1 ? id : (prev.anchor ?? origin),
        };
      }),
    [orderedIds, update],
  );

  const selectAll = useCallback(() => update(() => ({ selected: new Set(orderedIds) })), [orderedIds, update]);

  /** Select what is not selected and deselect what is (Ctrl+I). */
  const invert = useCallback(
    () => update((prev) => ({ selected: new Set(orderedIds.filter((id) => !prev.selected.has(id))) })),
    [orderedIds, update],
  );

  const clear = useCallback(() => update(() => ({ selected: new Set(), anchor: null })), [update]);

  /** Drop specific items from the selection (e.g. after they were moved or deleted). */
  const remove = useCallback(
    (ids: string[]) =>
      update((prev) => {
        if (!ids.some((id) => prev.selected.has(id))) return {};
        const next = new Set(prev.selected);
        ids.forEach((id) => next.delete(id));
        return { selected: next };
      }),
    [update],
  );

  /** Replace the selection with these items, ignoring any that are not shown. */
  const replace = useCallback(
    (ids: string[]) => {
      const visible = new Set(orderedIds);
      update(() => ({ selected: new Set(ids.filter((id) => visible.has(id))) }));
    },
    [orderedIds, update],
  );

  return { selected: current.selected, toggle, choose, selectRange, selectAll, invert, clear, remove, replace };
}

export type SelectionState = ReturnType<typeof useSelection>;
