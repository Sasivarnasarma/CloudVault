import { useCallback, useEffect, useState } from 'react';
import { errorMessage } from '../../lib/cn';
import { listObjects } from '../../services/objectService';
import type { ObjectListResponse } from '../../types';

export function useObjects(initialPrefix: string = '') {
  const [currentPrefix, setCurrentPrefix] = useState<string>(initialPrefix);
  const [data, setData] = useState<ObjectListResponse | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  const fetchListing = useCallback(async (prefix: string) => {
    setLoading(true);
    setError(null);
    try {
      const result = await listObjects(prefix);
      setData(result);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load storage objects'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchListing(currentPrefix);
  }, [currentPrefix, fetchListing]);

  const navigateToFolder = (prefix: string) => {
    setCurrentPrefix(prefix);
  };

  const navigateUp = () => {
    if (!currentPrefix) return;
    const clean = currentPrefix.replace(/\/+$/, '');
    const parts = clean.split('/');
    parts.pop();
    const parentPrefix = parts.length > 0 ? parts.join('/') + '/' : '';
    setCurrentPrefix(parentPrefix);
  };

  const refetch = () => {
    fetchListing(currentPrefix);
  };

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
