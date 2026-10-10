import { useEffect, useRef } from 'react';
import { ACTION_CHORDS, matchesChord, type ActionId } from '../../lib/keymap';

/** Return false to say "nothing to do", so the browser keeps its own behaviour for that key. */
export type ShortcutHandlers = Partial<Record<ActionId, () => void | false>>;

/**
 * Page-level keyboard shortcuts (see `lib/keymap.ts`).
 *
 * They are ignored while typing in a field, with a dialog or menu open, or when something else
 * already handled the key. A handler that does something stops the browser's own action for the
 * key (Ctrl+U would otherwise show the page source, F5 would reload the page).
 */
export function useFileShortcuts(handlers: ShortcutHandlers) {
  const latest = useRef(handlers);
  useEffect(() => {
    latest.current = handlers;
  });

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target && (['INPUT', 'TEXTAREA', 'SELECT'].includes(target.tagName) || target.isContentEditable)) return;
      if (document.querySelector('[role="dialog"], [role="menu"]')) return;

      for (const [action, chords] of ACTION_CHORDS) {
        if (!chords.some((chord) => matchesChord(e, chord))) continue;
        const handler = latest.current[action];
        if (!handler) continue;
        if (handler() !== false) e.preventDefault();
        return;
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
}
