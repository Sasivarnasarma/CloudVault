import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../lib/cn';
import { listObjects } from '../../services/objectService';
import type { ObjectListResponse } from '../../types';

const PATH_PARAM = 'p';
export const PAGE_SIZE = 500;

/** Folder prefix ('a/b/') stored in the URL as ?p=a/b, or '' for the root. */
function readPrefixFromUrl(): string {
  const raw = new URLSearchParams(window.location.search).get(PATH_PARAM) ?? '';
  const clean = raw.replace(/^\/+|\/+$/g, '');
  return clean ? `${clean}/` : '';
}

function urlForPrefix(prefix: string): string {
  const { pathname, hash } = window.location;
  if (!prefix) return `${pathname}${hash}`;
  const path = encodeURIComponent(prefix.replace(/\/+$/, '')).replace(/%2F/g, '/');
  return `${pathname}?${PATH_PARAM}=${path}${hash}`;
}

/** Append a freshly loaded page to what is already shown. */
function mergePage(current: ObjectListResponse, page: ObjectListResponse): ObjectListResponse {
  const folders = [...current.folders];
  const objects = [...current.objects];
  const seenFolders = new Set(folders.map((f) => f.prefix));
  const seenObjects = new Set(objects.map((o) => o.key));
  for (const folder of page.folders) if (!seenFolders.has(folder.prefix)) folders.push(folder);
  for (const object of page.objects) if (!seenObjects.has(object.key)) objects.push(object);

  return {
    ...page,
    folders,
    objects,
    total_count: folders.length + objects.length,
    total_size: objects.reduce((sum, o) => sum + o.size, 0),
  };
}

export function useObjects() {
  const [currentPrefix, setCurrentPrefix] = useState<string>(readPrefixFromUrl);
  const [data, setData] = useState<ObjectListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [loadMoreError, setLoadMoreError] = useState<string | null>(null);

  // Always points at the folder being viewed, so late callbacks refresh the right listing.
  const prefixRef = useRef(currentPrefix);
  // Incremented per request; only the latest response may update state.
  const latestRequest = useRef(0);
  const cursorRef = useRef<string | null>(null);
  const loadingMoreRef = useRef(false);

  /** Show the "loading" state again and forget what the previous request left behind. */
  const resetListingState = useCallback(() => {
    setLoading(true);
    setError(null);
    setHasMore(false);
    setLoadingMore(false);
    setLoadMoreError(null);
  }, []);

  // Moving to another folder starts over. Done while rendering, so the old folder's listing is never
  // shown under the new folder's name.
  const [shownPrefix, setShownPrefix] = useState(currentPrefix);
  if (shownPrefix !== currentPrefix) {
    setShownPrefix(currentPrefix);
    resetListingState();
  }

  /** Load the first page of a folder. Only the latest request may update state. */
  const fetchListing = useCallback(async (prefix: string) => {
    const requestId = ++latestRequest.current;
    cursorRef.current = null;
    loadingMoreRef.current = false;
    try {
      const result = await listObjects(prefix, { limit: PAGE_SIZE });
      if (requestId !== latestRequest.current) return;
      cursorRef.current = result.next_cursor ?? null;
      setHasMore(!!result.has_more);
      setData(result);
    } catch (err) {
      if (requestId === latestRequest.current) {
        setError(errorMessage(err, 'Failed to load storage objects'));
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  const loadMore = useCallback(async () => {
    const cursor = cursorRef.current;
    if (!cursor || loadingMoreRef.current) return;
    const requestId = latestRequest.current;
    loadingMoreRef.current = true;
    setLoadingMore(true);
    setLoadMoreError(null);
    try {
      const page = await listObjects(prefixRef.current, { limit: PAGE_SIZE, cursor });
      if (requestId !== latestRequest.current) return; // the user moved on or refreshed
      cursorRef.current = page.next_cursor ?? null;
      setHasMore(!!page.has_more);
      setData((prev) => (prev ? mergePage(prev, page) : page));
    } catch (err) {
      if (requestId === latestRequest.current) {
        setLoadMoreError(errorMessage(err, 'Failed to load more items'));
      }
    } finally {
      if (requestId === latestRequest.current) {
        loadingMoreRef.current = false;
        setLoadingMore(false);
      }
    }
  }, []);

  useEffect(() => {
    prefixRef.current = currentPrefix;
    // Loads data: state changes when the request settles (the reset for a new folder happens above).
    // oxlint-disable-next-line react/set-state-in-effect
    fetchListing(currentPrefix);
  }, [currentPrefix, fetchListing]);

  // Back/forward buttons and manual URL edits drive the current folder.
  useEffect(() => {
    const onPopState = () => setCurrentPrefix(readPrefixFromUrl());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const navigateToFolder = useCallback((prefix: string) => {
    if (prefix === prefixRef.current) return;
    window.history.pushState(null, '', urlForPrefix(prefix));
    setCurrentPrefix(prefix);
  }, []);

  const navigateUp = useCallback(() => {
    const prefix = prefixRef.current;
    if (!prefix) return;
    const parts = prefix.replace(/\/+$/, '').split('/');
    parts.pop();
    navigateToFolder(parts.length > 0 ? parts.join('/') + '/' : '');
  }, [navigateToFolder]);

  const refetch = useCallback(() => {
    resetListingState();
    fetchListing(prefixRef.current);
  }, [fetchListing, resetListingState]);

  return {
    currentPrefix,
    data,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
    navigateToFolder,
    navigateUp,
    refetch,
  };
}
