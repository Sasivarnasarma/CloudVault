/**
 * Every keyboard shortcut in one table. The page-level ones (`action`) are matched by
 * `useFileShortcuts`; the rest are handled next to the file list (`useEntryNavigation`) and are
 * listed here so the shortcuts dialog documents everything from a single place.
 *
 * A chord is written like "mod+shift+u": `mod` is Ctrl (or ⌘ on a Mac), then `shift` / `alt`, then
 * the key as `KeyboardEvent.key` names it ("F2", "ArrowUp", "Delete", "/", "a", "Space").
 */

export type ActionId =
  | 'focusSearch'
  | 'goUp'
  | 'clearSelection'
  | 'selectAll'
  | 'invertSelection'
  | 'deleteSelected'
  | 'rename'
  | 'download'
  | 'copy'
  | 'cut'
  | 'paste'
  | 'newFolder'
  | 'upload'
  | 'uploadFolder'
  | 'refresh'
  | 'contextMenu'
  | 'showShortcuts';

export type ShortcutGroup = 'Move around' | 'Select' | 'Work with items' | 'Upload and view';

export interface Shortcut {
  label: string;
  group: ShortcutGroup;
  chords: string[];
  /** Shown instead of keys when there is no fixed key to press (typing a name). */
  text?: string;
  /** Set for shortcuts handled by the page; the others are handled by the file list. */
  action?: ActionId;
}

export const SHORTCUTS: readonly Shortcut[] = [
  { group: 'Move around', label: 'Move between items', chords: ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'] },
  { group: 'Move around', label: 'First / last item', chords: ['Home', 'End'] },
  { group: 'Move around', label: 'Up / down a page', chords: ['PageUp', 'PageDown'] },
  { group: 'Move around', label: 'Jump to a name', chords: [], text: 'Type its first letters' },
  { group: 'Move around', label: 'Open folder / show file details', chords: ['Enter'] },
  { group: 'Move around', label: 'Up one folder', chords: ['Backspace', 'alt+ArrowUp'], action: 'goUp' },
  { group: 'Move around', label: 'Search this folder', chords: ['/', 'mod+e'], action: 'focusSearch' },

  { group: 'Select', label: 'Select the item', chords: ['Space'] },
  { group: 'Select', label: 'Add or remove the item', chords: ['mod+Space'] },
  { group: 'Select', label: 'Extend the selection', chords: ['shift+ArrowUp', 'shift+ArrowDown'] },
  { group: 'Select', label: 'Move without selecting', chords: ['mod+ArrowUp', 'mod+ArrowDown'] },
  { group: 'Select', label: 'Select all', chords: ['mod+a'], action: 'selectAll' },
  { group: 'Select', label: 'Invert selection', chords: ['mod+i'], action: 'invertSelection' },
  { group: 'Select', label: 'Clear selection', chords: ['Escape'], action: 'clearSelection' },

  { group: 'Work with items', label: 'Rename', chords: ['F2'], action: 'rename' },
  {
    group: 'Work with items',
    label: 'Download (a folder or selection as a zip)',
    chords: ['mod+d'],
    action: 'download',
  },
  { group: 'Work with items', label: 'Copy', chords: ['mod+c'], action: 'copy' },
  { group: 'Work with items', label: 'Cut', chords: ['mod+x'], action: 'cut' },
  { group: 'Work with items', label: 'Paste here', chords: ['mod+v'], action: 'paste' },
  { group: 'Work with items', label: 'Delete', chords: ['Delete', 'shift+Delete'], action: 'deleteSelected' },
  {
    group: 'Work with items',
    label: 'Open the item’s menu',
    chords: ['shift+F10', 'ContextMenu'],
    action: 'contextMenu',
  },

  { group: 'Upload and view', label: 'New folder', chords: ['alt+n'], action: 'newFolder' },
  { group: 'Upload and view', label: 'Upload files', chords: ['mod+u'], action: 'upload' },
  { group: 'Upload and view', label: 'Upload a folder', chords: ['mod+shift+u'], action: 'uploadFolder' },
  { group: 'Upload and view', label: 'Refresh', chords: ['F5', 'mod+r'], action: 'refresh' },
  { group: 'Upload and view', label: 'Show keyboard shortcuts', chords: ['?'], action: 'showShortcuts' },
];

export const ACTION_CHORDS: ReadonlyArray<readonly [ActionId, readonly string[]]> = SHORTCUTS.flatMap((s) =>
  s.action ? [[s.action, s.chords] as const] : [],
);

interface ParsedChord {
  mod: boolean;
  shift: boolean;
  alt: boolean;
  key: string;
}

export function parseChord(chord: string): ParsedChord {
  const parts = chord.split('+');
  const key = parts.pop() ?? '';
  return {
    mod: parts.includes('mod'),
    shift: parts.includes('shift'),
    alt: parts.includes('alt'),
    key: key === 'Space' ? ' ' : key,
  };
}

type KeyEventLike = Pick<KeyboardEvent, 'key' | 'code' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>;

/** Does this key press match the chord? Modifiers must match exactly. */
export function matchesChord(e: KeyEventLike, chord: string): boolean {
  const c = parseChord(chord);
  if (c.mod !== (e.ctrlKey || e.metaKey) || c.alt !== e.altKey) return false;

  const isLetter = /^[a-z]$/i.test(c.key);
  const isDigit = /^[0-9]$/.test(c.key);
  // Symbols such as "/" and "?" need Shift on some layouts, so only letters, digits and named keys check it.
  if ((isLetter || isDigit || c.key.length > 1) && c.shift !== e.shiftKey) return false;

  // With Alt held a Mac types another character ("ñ" for Alt+N), so go by the physical key.
  if (c.alt && isLetter) return e.code === `Key${c.key.toUpperCase()}`;
  if (c.alt && isDigit) return e.code === `Digit${c.key}`;
  return e.key.toLowerCase() === c.key.toLowerCase();
}

export function isMac(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /mac|iphone|ipad/i.test(navigator.platform || navigator.userAgent);
}

const KEY_NAMES: Record<string, string> = {
  ArrowUp: '↑',
  ArrowDown: '↓',
  ArrowLeft: '←',
  ArrowRight: '→',
  Escape: 'Esc',
  ContextMenu: 'Menu',
  ' ': 'Space',
  PageUp: 'PgUp',
  PageDown: 'PgDn',
};

/** The key caps to show for a chord, e.g. ["Ctrl", "Shift", "U"] (or ["⌘", "⇧", "U"] on a Mac). */
export function chordKeys(chord: string, mac = isMac()): string[] {
  const c = parseChord(chord);
  const keys: string[] = [];
  if (c.mod) keys.push(mac ? '⌘' : 'Ctrl');
  if (c.alt) keys.push(mac ? '⌥' : 'Alt');
  if (c.shift) keys.push(mac ? '⇧' : 'Shift');
  keys.push(KEY_NAMES[c.key] ?? (c.key.length === 1 ? c.key.toUpperCase() : c.key));
  return keys;
}
