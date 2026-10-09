import { act, renderHook } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { useSelection } from './useSelection';

const IDS = ['a', 'b', 'c', 'd', 'e'];
const ids = (selected: ReadonlySet<string>) => [...selected].sort();

function setup(initialIds = IDS, resetKey = 'root') {
  return renderHook(({ list, key }) => useSelection(list, key), { initialProps: { list: initialIds, key: resetKey } });
}

describe('useSelection', () => {
  it('starts empty and toggles single items', () => {
    const { result } = setup();
    expect(result.current.selected.size).toBe(0);
    act(() => result.current.toggle('b'));
    act(() => result.current.toggle('d'));
    expect(ids(result.current.selected)).toEqual(['b', 'd']);
    act(() => result.current.toggle('b'));
    expect(ids(result.current.selected)).toEqual(['d']);
  });

  it('selectOnly replaces the selection, and clicking the only selected item again clears it', () => {
    const { result } = setup();
    act(() => result.current.toggle('a'));
    act(() => result.current.toggle('b'));
    act(() => result.current.selectOnly('c'));
    expect(ids(result.current.selected)).toEqual(['c']);
    act(() => result.current.selectOnly('c'));
    expect(result.current.selected.size).toBe(0);
  });

  it('selects ranges from the last clicked item, in either direction', () => {
    const { result } = setup();
    act(() => result.current.selectOnly('b'));
    act(() => result.current.selectRange('d'));
    expect(ids(result.current.selected)).toEqual(['b', 'c', 'd']);
    act(() => result.current.selectRange('a'));
    expect(ids(result.current.selected)).toEqual(['a', 'b']);
  });

  it('starts a range at the clicked item when there is no anchor, and ignores unknown ids', () => {
    const { result } = setup();
    act(() => result.current.selectRange('c'));
    expect(ids(result.current.selected)).toEqual(['c']);
    act(() => result.current.selectRange('missing'));
    expect(ids(result.current.selected)).toEqual(['c']);
  });

  it('selects everything shown, clears, replaces and removes', () => {
    const { result } = setup();
    act(() => result.current.selectAll());
    expect(ids(result.current.selected)).toEqual(IDS);
    act(() => result.current.remove(['a', 'e', 'zzz']));
    expect(ids(result.current.selected)).toEqual(['b', 'c', 'd']);
    act(() => result.current.replace(['x', 'a']));
    expect(ids(result.current.selected)).toEqual(['a']); // 'x' is not shown, so it cannot be selected
    act(() => result.current.clear());
    expect(result.current.selected.size).toBe(0);
  });

  it('drops items that stop being visible so actions can never reach hidden items', () => {
    const { result, rerender } = setup();
    act(() => result.current.selectAll());
    rerender({ list: ['b', 'd'], key: 'root' });
    expect(ids(result.current.selected)).toEqual(['b', 'd']);
  });

  it('keeps the same selection object when nothing needed pruning', () => {
    const { result, rerender } = setup();
    act(() => result.current.toggle('a'));
    const before = result.current.selected;
    rerender({ list: [...IDS], key: 'root' });
    expect(result.current.selected).toBe(before);
  });

  it('resets when the folder changes', () => {
    const { result, rerender } = setup();
    act(() => result.current.selectAll());
    rerender({ list: IDS, key: 'other/' });
    expect(result.current.selected.size).toBe(0);
  });
});
