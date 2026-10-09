import { useCallback, useEffect, useRef, useState } from 'react';
import { errorMessage } from '../../lib/cn';
import { listObjects } from '../../services/objectService';
import type { ObjectListResponse } from '../../types';

const PATH_PARAM = 'p';

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

export function useObjects() {
  const [currentPrefix, setCurrentPrefix] = useState<string>(readPrefixFromUrl);
  const [data, setData] = useState<ObjectListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Always points at the folder being viewed, so late callbacks refresh the right listing.
  const prefixRef = useRef(currentPrefix);
  // Incremented per request; only the latest response may update state.
  const latestRequest = useRef(0);

  const fetchListing = useCallback(async (prefix: string) => {
    const requestId = ++latestRequest.current;
    setLoading(true);
    setError(null);
    try {
      const result = await listObjects(prefix);
      if (requestId === latestRequest.current) setData(result);
    } catch (err) {
      if (requestId === latestRequest.current) {
        setError(errorMessage(err, 'Failed to load storage objects'));
      }
    } finally {
      if (requestId === latestRequest.current) setLoading(false);
    }
  }, []);

  useEffect(() => {
    prefixRef.current = currentPrefix;
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
    fetchListing(prefixRef.current);
  }, [fetchListing]);

  return {
    currentPrefix,
    data,
    loading,
    error,
    navigateToFolder,
    navigateUp,
    refetch,
  };
}
