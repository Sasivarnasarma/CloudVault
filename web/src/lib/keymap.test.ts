import { describe, expect, it } from 'vitest';
import { ACTION_CHORDS, SHORTCUTS, chordKeys, matchesChord, parseChord } from './keymap';

const press = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey', boolean>> = {}, code = '') => ({
  key,
  code,
  ctrlKey: false,
  metaKey: false,
  altKey: false,
  shiftKey: false,
  ...mods,
});

describe('parseChord', () => {
  it('reads modifiers and the key', () => {
    expect(parseChord('mod+shift+u')).toEqual({ mod: true, shift: true, alt: false, key: 'u' });
    expect(parseChord('alt+ArrowUp')).toEqual({ mod: false, shift: false, alt: true, key: 'ArrowUp' });
    expect(parseChord('F2')).toEqual({ mod: false, shift: false, alt: false, key: 'F2' });
    expect(parseChord('mod+Space').key).toBe(' ');
  });
});

describe('matchesChord', () => {
  it('matches named keys and needs the modifiers to match exactly', () => {
    expect(matchesChord(press('F2'), 'F2')).toBe(true);
    expect(matchesChord(press('F2', { ctrlKey: true }), 'F2')).toBe(false);
    expect(matchesChord(press('Delete'), 'Delete')).toBe(true);
    expect(matchesChord(press('Delete', { shiftKey: true }), 'Delete')).toBe(false);
    expect(matchesChord(press('Delete', { shiftKey: true }), 'shift+Delete')).toBe(true);
  });

  it('treats Ctrl and ⌘ as the same "mod" key and ignores the letter case', () => {
    expect(matchesChord(press('a', { ctrlKey: true }), 'mod+a')).toBe(true);
    expect(matchesChord(press('a', { metaKey: true }), 'mod+a')).toBe(true);
    expect(matchesChord(press('A', { ctrlKey: true }), 'mod+a')).toBe(true);
    expect(matchesChord(press('a'), 'mod+a')).toBe(false);
    expect(matchesChord(press('a', { ctrlKey: true, shiftKey: true }), 'mod+a')).toBe(false);
    expect(matchesChord(press('U', { ctrlKey: true, shiftKey: true }), 'mod+shift+u')).toBe(true);
    expect(matchesChord(press('u', { ctrlKey: true }), 'mod+shift+u')).toBe(false);
  });

  it('does not care whether Shift is held for symbols such as "?" and "/"', () => {
    expect(matchesChord(press('?', { shiftKey: true }), '?')).toBe(true);
    expect(matchesChord(press('?'), '?')).toBe(true);
    expect(matchesChord(press('/'), '/')).toBe(true);
    expect(matchesChord(press('/'), '?')).toBe(false);
  });

  it('matches Alt+letter by the physical key, since Alt types another character on a Mac', () => {
    expect(matchesChord(press('ñ', { altKey: true }, 'KeyN'), 'alt+n')).toBe(true);
    expect(matchesChord(press('n', { altKey: true }, 'KeyN'), 'alt+n')).toBe(true);
    expect(matchesChord(press('n', { altKey: true }, 'KeyM'), 'alt+n')).toBe(false);
    expect(matchesChord(press('n'), 'alt+n')).toBe(false);
  });

  it('matches Alt+arrow keys and the Menu key', () => {
    expect(matchesChord(press('ArrowUp', { altKey: true }), 'alt+ArrowUp')).toBe(true);
    expect(matchesChord(press('ArrowUp'), 'alt+ArrowUp')).toBe(false);
    expect(matchesChord(press('ContextMenu'), 'ContextMenu')).toBe(true);
    expect(matchesChord(press('F10', { shiftKey: true }), 'shift+F10')).toBe(true);
  });
});

describe('chordKeys', () => {
  it('names the keys for Windows / Linux and for a Mac', () => {
    expect(chordKeys('mod+shift+u', false)).toEqual(['Ctrl', 'Shift', 'U']);
    expect(chordKeys('mod+shift+u', true)).toEqual(['⌘', '⇧', 'U']);
    expect(chordKeys('alt+n', false)).toEqual(['Alt', 'N']);
    expect(chordKeys('alt+n', true)).toEqual(['⌥', 'N']);
    expect(chordKeys('ArrowUp', false)).toEqual(['↑']);
    expect(chordKeys('Escape', false)).toEqual(['Esc']);
    expect(chordKeys('mod+Space', false)).toEqual(['Ctrl', 'Space']);
    expect(chordKeys('F5', false)).toEqual(['F5']);
    expect(chordKeys('?', false)).toEqual(['?']);
  });
});

describe('the shortcut table', () => {
  it('gives every page-level action at least one chord, and no chord to two actions', () => {
    const seen = new Map<string, string>();
    for (const [action, chords] of ACTION_CHORDS) {
      expect(chords.length, action).toBeGreaterThan(0);
      for (const chord of chords) {
        expect(seen.get(chord), `${chord} is used by ${seen.get(chord)} and ${action}`).toBeUndefined();
        seen.set(chord, action);
      }
    }
  });

  it('never uses a key the browser keeps for itself, which a page cannot override', () => {
    const reserved = ['mod+n', 'mod+shift+n', 'mod+t', 'mod+shift+t', 'mod+w', 'mod+shift+w'];
    const used = SHORTCUTS.flatMap((s) => s.chords);
    expect(used.filter((c) => reserved.includes(c))).toEqual([]);
  });

  it('has a distinct label for every shortcut, so the dialog can list them all', () => {
    const labels = SHORTCUTS.map((s) => s.label);
    expect(new Set(labels).size).toBe(labels.length);
  });
});
