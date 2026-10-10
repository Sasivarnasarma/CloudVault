import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useAppView } from './useAppView';

beforeEach(() => window.history.replaceState(null, '', '/'));

describe('useAppView', () => {
  it('starts in the files, or in the trash when the address says so', () => {
    expect(renderHook(() => useAppView('')).result.current.view).toBe('files');

    window.history.replaceState(null, '', '/?view=trash');
    expect(renderHook(() => useAppView('')).result.current.view).toBe('trash');
  });

  it('opens the trash by adding it to the address, and does not pile up history when asked twice', () => {
    const { result } = renderHook(() => useAppView('docs/'));
    const before = window.history.length;
    act(() => result.current.openTrash());
    expect(result.current.view).toBe('trash');
    expect(window.location.search).toBe('?view=trash');

    act(() => result.current.openTrash());
    expect(window.history.length).toBe(before + 1);
  });

  it('goes back to the folder that was open', () => {
    window.history.replaceState(null, '', '/?p=docs');
    const { result } = renderHook(() => useAppView('docs/'));
    act(() => result.current.openTrash());
    act(() => result.current.openFiles());

    expect(result.current.view).toBe('files');
    expect(window.location.search).toBe('?p=docs');
  });

  it('does nothing when asked for the files while they are showing', () => {
    const { result } = renderHook(() => useAppView(''));
    const before = window.history.length;
    act(() => result.current.openFiles());
    expect(window.history.length).toBe(before);
    expect(result.current.view).toBe('files');
  });

  it('follows the back and forward buttons', () => {
    const { result } = renderHook(() => useAppView(''));
    act(() => result.current.openTrash());
    act(() => {
      window.history.replaceState(null, '', '/');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.view).toBe('files');
  });
});
