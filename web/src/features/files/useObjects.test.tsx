import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFile, makeListing } from '../../test/fixtures';
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
    expect(listMock).toHaveBeenCalledWith('', { limit: 500 });
    expect(result.current.currentPrefix).toBe('');
    expect(result.current.data?.prefix).toBe('');
  });

  it('starts in the folder named by ?p= so a refresh restores the path', async () => {
    window.history.replaceState(null, '', '/?p=docs/sub%20dir');
    const { result } = renderHook(() => useObjects());
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.currentPrefix).toBe('docs/sub dir/');
    expect(listMock).toHaveBeenCalledWith('docs/sub dir/', { limit: 500 });
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
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('elsewhere/', { limit: 500 }));
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
    expect(listMock).toHaveBeenCalledWith('later/', { limit: 500 });
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

  describe('pagination', () => {
    const page = (names: string[], next: string | null, prefix = ''): ObjectListResponse => ({
      ...makeListing(
        prefix,
        [],
        names.map((n) => makeFile(n, { size: 10 })),
      ),
      next_cursor: next,
      has_more: next !== null,
    });

    it('loads the first page with the page size and reports more to come', async () => {
      listMock.mockResolvedValueOnce(page(['a', 'b'], 'c1'));
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.loading).toBe(false));
      expect(listMock).toHaveBeenCalledWith('', { limit: 500 });
      expect(result.current.hasMore).toBe(true);
    });

    it('appends the next page using the cursor and stops at the end', async () => {
      listMock.mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockResolvedValueOnce(page(['c'], null));
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      await act(() => result.current.loadMore());
      expect(listMock).toHaveBeenLastCalledWith('', { limit: 500, cursor: 'c1' });
      expect(result.current.data?.objects.map((o) => o.name)).toEqual(['a', 'b', 'c']);
      expect(result.current.data?.total_count).toBe(3);
      expect(result.current.data?.total_size).toBe(30);
      expect(result.current.hasMore).toBe(false);
    });

    it('never shows an item twice if pages overlap', async () => {
      listMock.mockResolvedValueOnce(page(['a', 'b'], 'c1')).mockResolvedValueOnce(page(['b', 'c'], null));
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      await act(() => result.current.loadMore());
      expect(result.current.data?.objects.map((o) => o.name)).toEqual(['a', 'b', 'c']);
    });

    it('ignores loadMore when there is nothing more or a request is already running', async () => {
      const pending = deferred<ObjectListResponse>();
      listMock.mockResolvedValueOnce(page(['a'], 'c1')).mockReturnValueOnce(pending.promise);
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      act(() => {
        void result.current.loadMore();
        void result.current.loadMore();
      });
      expect(listMock).toHaveBeenCalledTimes(2); // first page + exactly one more
      expect(result.current.loadingMore).toBe(true);

      await act(async () => pending.resolve(page(['b'], null)));
      expect(result.current.loadingMore).toBe(false);
      listMock.mockClear();
      await act(() => result.current.loadMore());
      expect(listMock).not.toHaveBeenCalled();
    });

    it('drops a late page when the user has already left the folder', async () => {
      const slow = deferred<ObjectListResponse>();
      listMock.mockImplementation((prefix = '', opts) => {
        if (opts?.cursor) return slow.promise;
        return Promise.resolve(prefix === '' ? page(['a'], 'c1') : page(['other'], null, prefix));
      });
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      act(() => {
        void result.current.loadMore();
      });
      act(() => result.current.navigateToFolder('next/'));
      await waitFor(() => expect(result.current.data?.prefix).toBe('next/'));

      await act(async () => slow.resolve(page(['stale'], null)));
      expect(result.current.data?.objects.map((o) => o.name)).toEqual(['other']);
      expect(result.current.loadingMore).toBe(false);
    });

    it('reports a failed page and lets the user retry it', async () => {
      listMock
        .mockResolvedValueOnce(page(['a'], 'c1'))
        .mockRejectedValueOnce(new Error('Storage service is unavailable'))
        .mockResolvedValueOnce(page(['b'], null));
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.hasMore).toBe(true));

      await act(() => result.current.loadMore());
      expect(result.current.loadMoreError).toBe('Storage service is unavailable');
      expect(result.current.data?.objects).toHaveLength(1);
      expect(result.current.hasMore).toBe(true);

      await act(() => result.current.loadMore());
      expect(result.current.loadMoreError).toBeNull();
      expect(result.current.data?.objects.map((o) => o.name)).toEqual(['a', 'b']);
    });

    it('starts over from the first page on refetch', async () => {
      listMock.mockResolvedValueOnce(page(['a'], 'c1')).mockResolvedValueOnce(page(['b'], null));
      const { result } = renderHook(() => useObjects());
      await waitFor(() => expect(result.current.hasMore).toBe(true));
      await act(() => result.current.loadMore());
      expect(result.current.data?.objects).toHaveLength(2);

      listMock.mockResolvedValueOnce(page(['a'], 'c9'));
      act(() => result.current.refetch());
      await waitFor(() => expect(result.current.data?.objects).toHaveLength(1));
      expect(result.current.hasMore).toBe(true);
    });
  });
});
