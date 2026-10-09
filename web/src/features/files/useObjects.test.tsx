import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeListing } from '../../test/fixtures';
import type { ObjectListResponse } from '../../types';
import { useObjects } from './useObjects';

vi.mock('../../services/objectService', () => ({ listObjects: vi.fn() }));
import { listObjects } from '../../services/objectService';

const listMock = vi.mocked(listObjects);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((res) => {
    resolve = res;
  });
  return { promise, resolve };
}

beforeEach(() => {
  listMock.mockReset();
  listMock.mockImplementation(async (prefix = '') => makeListing(prefix));
});

describe('useObjects', () => {
  it('loads the root listing by default', async () => {
    const { result } = renderHook(() => useObjects());
    expect(result.current.loading).toBe(true);
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(listMock).toHaveBeenCalledWith('');
    expect(result.current.currentPrefix).toBe('');
    expect(result.current.data?.prefix).toBe('');
  });

  it('starts in the folder named by ?p= so a refresh restores the path', async () => {
    window.history.replaceState(null, '', '/?p=docs/sub%20dir');
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentPrefix).toBe('docs/sub dir/');
    expect(listMock).toHaveBeenCalledWith('docs/sub dir/');
  });

  it('writes the folder to the URL when navigating and clears it at the root', async () => {
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.navigateToFolder('docs/sub dir/'));
    expect(window.location.search).toBe('?p=docs/sub%20dir');
    await waitFor(() => expect(result.current.data?.prefix).toBe('docs/sub dir/'));

    act(() => result.current.navigateToFolder(''));
    expect(window.location.search).toBe('');
    await waitFor(() => expect(result.current.currentPrefix).toBe(''));
  });

  it('does not add history entries when re-opening the current folder', async () => {
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    act(() => result.current.navigateToFolder('a/'));
    const length = window.history.length;
    act(() => result.current.navigateToFolder('a/'));
    expect(window.history.length).toBe(length);
  });

  it('follows the browser back/forward buttons', async () => {
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => {
      window.history.replaceState(null, '', '/?p=elsewhere');
      window.dispatchEvent(new PopStateEvent('popstate'));
    });
    expect(result.current.currentPrefix).toBe('elsewhere/');
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('elsewhere/'));
  });

  it('navigates up one level and stops at the root', async () => {
    window.history.replaceState(null, '', '/?p=a/b/c');
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));

    act(() => result.current.navigateUp());
    expect(result.current.currentPrefix).toBe('a/b/');
    act(() => result.current.navigateUp());
    act(() => result.current.navigateUp());
    expect(result.current.currentPrefix).toBe('');
    act(() => result.current.navigateUp());
    expect(result.current.currentPrefix).toBe('');
  });

  it('ignores a slow response for a folder the user already left', async () => {
    const slow = deferred<ObjectListResponse>();
    listMock.mockImplementation((prefix = '') => (prefix === '' ? slow.promise : Promise.resolve(makeListing(prefix))));

    const { result } = renderHook(() => useObjects());
    act(() => result.current.navigateToFolder('fast/'));
    await waitFor(() => expect(result.current.data?.prefix).toBe('fast/'));

    await act(async () => slow.resolve(makeListing(''))); // late response for the root
    expect(result.current.data?.prefix).toBe('fast/');
    expect(result.current.loading).toBe(false);
  });

  it('refetches the folder currently being viewed, not the one at call time', async () => {
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    const { refetch } = result.current; // captured early, as an upload callback would

    act(() => result.current.navigateToFolder('later/'));
    await waitFor(() => expect(result.current.data?.prefix).toBe('later/'));
    listMock.mockClear();

    act(() => refetch());
    expect(listMock).toHaveBeenCalledWith('later/');
  });

  it('exposes errors and recovers on retry', async () => {
    listMock.mockRejectedValueOnce(new Error('Storage service is unavailable'));
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.error).toBe('Storage service is unavailable'));
    expect(result.current.loading).toBe(false);

    act(() => result.current.refetch());
    await waitFor(() => expect(result.current.data).not.toBeNull());
    expect(result.current.error).toBeNull();
    expect(result.current.loading).toBe(false);
  });
});
