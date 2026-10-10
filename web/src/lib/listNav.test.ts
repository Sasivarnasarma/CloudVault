import { describe, expect, it } from 'vitest';
import { extendTypeAhead, isNavKey, isTypeAheadChar, nextIndex, typeAheadMatch, TYPE_AHEAD_MS } from './listNav';

const list = { columns: 1, pageSize: 5 };
const grid = { columns: 4, pageSize: 8 };

describe('nextIndex', () => {
  it('moves one item at a time in a list and stops at the edges', () => {
    expect(nextIndex('ArrowDown', 2, 10, list)).toBe(3);
    expect(nextIndex('ArrowUp', 2, 10, list)).toBe(1);
    expect(nextIndex('ArrowUp', 0, 10, list)).toBe(0);
    expect(nextIndex('ArrowDown', 9, 10, list)).toBe(9);
  });

  it('jumps to the first / last item with Home and End', () => {
    expect(nextIndex('Home', 6, 10, list)).toBe(0);
    expect(nextIndex('End', 2, 10, list)).toBe(9);
  });

  it('moves a screenful with PageUp / PageDown and stops at the edges', () => {
    expect(nextIndex('PageDown', 1, 20, list)).toBe(6);
    expect(nextIndex('PageUp', 12, 20, list)).toBe(7);
    expect(nextIndex('PageDown', 18, 20, list)).toBe(19);
    expect(nextIndex('PageUp', 2, 20, list)).toBe(0);
  });

  it('moves by rows with up / down and by one with left / right in a grid', () => {
    expect(nextIndex('ArrowDown', 1, 12, grid)).toBe(5);
    expect(nextIndex('ArrowUp', 5, 12, grid)).toBe(1);
    expect(nextIndex('ArrowRight', 5, 12, grid)).toBe(6);
    expect(nextIndex('ArrowLeft', 5, 12, grid)).toBe(4);
    expect(nextIndex('PageDown', 1, 40, grid)).toBe(9);
  });

  it('does not wrap around the edges of a grid row', () => {
    expect(nextIndex('ArrowLeft', 0, 12, grid)).toBe(0);
    expect(nextIndex('ArrowRight', 11, 12, grid)).toBe(11);
    expect(nextIndex('ArrowUp', 2, 12, grid)).toBe(2);
  });

  it('goes to the final item when down is pressed above a short last row, and stays on the last row', () => {
    // 10 items in rows of 4: 0-3, 4-7, 8-9
    expect(nextIndex('ArrowDown', 6, 10, grid)).toBe(9);
    expect(nextIndex('ArrowDown', 9, 10, grid)).toBe(9);
    expect(nextIndex('ArrowDown', 8, 10, grid)).toBe(8);
  });

  it('copes with nothing to navigate, a stale index and keys that do not navigate', () => {
    expect(nextIndex('ArrowDown', 0, 0, list)).toBeNull();
    expect(nextIndex('a', 0, 5, list)).toBeNull();
    expect(nextIndex('ArrowDown', 99, 5, list)).toBe(4);
    expect(nextIndex('ArrowDown', -1, 5, list)).toBe(1);
    expect(nextIndex('ArrowDown', 0, 5, { columns: 0, pageSize: 0 })).toBe(1);
  });
});

describe('isNavKey / isTypeAheadChar', () => {
  const press = (key: string, mods: Partial<Record<'ctrlKey' | 'metaKey' | 'altKey', boolean>> = {}) => ({
    key,
    ctrlKey: false,
    metaKey: false,
    altKey: false,
    ...mods,
  });

  it('recognises the navigation keys', () => {
    expect(['ArrowUp', 'Home', 'PageDown'].every(isNavKey)).toBe(true);
    expect(isNavKey('Enter')).toBe(false);
  });

  it('treats letters and digits as type-ahead but not shortcuts, spaces or named keys', () => {
    expect(isTypeAheadChar(press('a'))).toBe(true);
    expect(isTypeAheadChar(press('A'))).toBe(true);
    expect(isTypeAheadChar(press('7'))).toBe(true);
    expect(isTypeAheadChar(press('/'))).toBe(false);
    expect(isTypeAheadChar(press(' '))).toBe(false);
    expect(isTypeAheadChar(press('Delete'))).toBe(false);
    expect(isTypeAheadChar(press('a', { ctrlKey: true }))).toBe(false);
    expect(isTypeAheadChar(press('a', { metaKey: true }))).toBe(false);
    expect(isTypeAheadChar(press('a', { altKey: true }))).toBe(false);
  });
});

describe('type-ahead', () => {
  it('builds up the typed text and starts over after a pause', () => {
    let state = extendTypeAhead({ query: '', at: 0 }, 'r', 1000);
    expect(state.query).toBe('r');
    state = extendTypeAhead(state, 'e', 1000 + TYPE_AHEAD_MS);
    expect(state.query).toBe('re');
    state = extendTypeAhead(state, 'p', 1000 + TYPE_AHEAD_MS * 3);
    expect(state.query).toBe('p');
  });

  const names = ['Photos', 'Reports', 'apple.txt', 'avocado.txt', 'report.pdf', 'zebra.png'];

  it('finds the first name that starts with the text, ignoring case', () => {
    expect(typeAheadMatch(names, 'z', 0)).toBe(5);
    expect(typeAheadMatch(names, 'REP', 0)).toBe(1);
    expect(typeAheadMatch(names, 'report.', 0)).toBe(4);
  });

  it('keeps the current item when it still matches the longer text', () => {
    expect(typeAheadMatch(names, 'rep', 4)).toBe(4);
    expect(typeAheadMatch(names, 'rep', 1)).toBe(1);
  });

  it('cycles through names with the same first letter when that letter is repeated', () => {
    expect(typeAheadMatch(names, 'a', 0)).toBe(2);
    expect(typeAheadMatch(names, 'a', 2)).toBe(3);
    expect(typeAheadMatch(names, 'a', 3)).toBe(2);
    expect(typeAheadMatch(names, 'aa', 2)).toBe(3);
  });

  it('stays on the only match and finds nothing for text that matches no name', () => {
    expect(typeAheadMatch(names, 'z', 5)).toBe(5);
    expect(typeAheadMatch(names, 'q', 0)).toBe(-1);
    expect(typeAheadMatch([], 'a', 0)).toBe(-1);
    expect(typeAheadMatch(names, '', 0)).toBe(-1);
  });

  it('starts from the top when nothing is current', () => {
    expect(typeAheadMatch(names, 'r', -1)).toBe(1);
    expect(typeAheadMatch(names, 're', -1)).toBe(1);
  });
});
