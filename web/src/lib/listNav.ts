/** Pure keyboard-navigation maths for the file list/grid, kept free of the DOM so it is easy to test. */

export interface NavLayout {
  /** Items per row: 1 in the list view. */
  columns: number;
  /** How many items one PageUp / PageDown moves. */
  pageSize: number;
}

export const NAV_KEYS = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'] as const;

export function isNavKey(key: string): boolean {
  return (NAV_KEYS as readonly string[]).includes(key);
}

/**
 * Where the cursor goes when `key` is pressed on item `index` of `count`. Always lands on a real
 * item (it stops at the edges instead of wrapping); returns null for a key that doesn't navigate or
 * when there is nothing to navigate.
 */
export function nextIndex(key: string, index: number, count: number, { columns, pageSize }: NavLayout): number | null {
  if (count <= 0 || !isNavKey(key)) return null;
  const last = count - 1;
  const cols = Math.max(1, columns);
  const page = Math.max(1, pageSize);
  const at = Math.min(Math.max(index, 0), last);

  switch (key) {
    case 'ArrowUp':
      return at - cols >= 0 ? at - cols : at;
    case 'ArrowDown':
      if (at + cols <= last) return at + cols;
      // A short last row: from any earlier row, Down goes to the final item.
      return Math.floor(at / cols) < Math.floor(last / cols) ? last : at;
    case 'ArrowLeft':
      return Math.max(0, at - 1);
    case 'ArrowRight':
      return Math.min(last, at + 1);
    case 'Home':
      return 0;
    case 'End':
      return last;
    case 'PageUp':
      return Math.max(0, at - page);
    default:
      return Math.min(last, at + page);
  }
}

export const TYPE_AHEAD_MS = 800;

export interface TypeAhead {
  query: string;
  at: number;
}

/** Add a typed character to the type-ahead buffer, starting over if the last key was a while ago. */
export function extendTypeAhead(prev: TypeAhead, char: string, now: number): TypeAhead {
  return { query: now - prev.at > TYPE_AHEAD_MS ? char : prev.query + char, at: now };
}

/** Typing something that can be part of a name (not a shortcut such as "/" or a space). */
export function isTypeAheadChar(e: { key: string; ctrlKey: boolean; metaKey: boolean; altKey: boolean }): boolean {
  return e.key.length === 1 && e.key !== ' ' && e.key !== '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * The item to jump to for the typed text, like Windows Explorer: "ab" finds the first name starting
 * with "ab" (the current one counts); pressing the same letter again ("a", "aa") cycles through the
 * names starting with it. Returns -1 when nothing matches.
 */
export function typeAheadMatch(names: readonly string[], query: string, current: number): number {
  const q = query.toLowerCase();
  if (!q || names.length === 0) return -1;
  const cycling = [...q].every((c) => c === q[0]);
  const needle = cycling ? q[0] : q;
  const start = cycling ? current + 1 : Math.max(current, 0);

  for (let i = 0; i < names.length; i++) {
    const index = (start + i) % names.length;
    if (names[index].toLowerCase().startsWith(needle)) return index;
  }
  return -1;
}
