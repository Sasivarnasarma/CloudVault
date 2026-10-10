import { useCallback, useEffect, useState } from 'react';
import { fetchHealthStatus } from '../services/healthService';
import type { HealthResponse } from '../types';

/** Connection status of the API and its storage, loaded on mount and whenever `reload` is called. */
export function useHealth() {
  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  const reload = useCallback(async () => {
    setLoading(true);
    setError(false);
    try {
      setHealth(await fetchHealthStatus());
    } catch {
      setError(true);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loads data: state changes when the request settles.
    // oxlint-disable-next-line react/set-state-in-effect
    reload();
  }, [reload]);

  return { health, loading, error, reload };
}
