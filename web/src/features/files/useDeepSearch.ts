import { useEffect, useState } from 'react';
import { errorMessage } from '../../lib/cn';
import { searchObjects } from '../../services/objectService';
import type { ObjectSearchResponse } from '../../types';

/** How long typing has to pause before the bucket is searched. */
const DEBOUNCE_MS = 300;

interface Outcome {
  key: string;
  response?: ObjectSearchResponse;
  error?: string;
}

/**
 * Search a folder and everything below it by name. It waits for a pause in typing, and when
 * `reloadKey` changes (the folder was reloaded after a change) it searches again while the old
 * results stay on screen.
 */
export function useDeepSearch(prefix: string, query: string, enabled: boolean, reloadKey: unknown) {
  const trimmed = query.trim();
  const active = enabled && trimmed !== '';

  const [settled, setSettled] = useState(trimmed);
  useEffect(() => {
    const timer = window.setTimeout(() => setSettled(trimmed), DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [trimmed]);

  const [outcome, setOutcome] = useState<Outcome | null>(null);
  const key = `${prefix}|${settled}`;

  useEffect(() => {
    if (!active || settled === '') return;
    const controller = new AbortController();
    searchObjects(settled, prefix, controller.signal)
      .then((response) => setOutcome({ key, response }))
      .catch((err) => {
        if (!controller.signal.aborted) setOutcome({ key, error: errorMessage(err, 'Search failed') });
      });
    return () => controller.abort();
  }, [active, settled, prefix, key, reloadKey]);

  // Results of an earlier search of the same folder stay until the new ones arrive.
  const current = active && outcome?.key.startsWith(`${prefix}|`) ? outcome : null;
  return {
    active,
    /** Waiting for the first results of this search. */
    searching: active && (settled !== trimmed || outcome?.key !== key) && !current?.response,
    response: current?.response ?? null,
    error: active && outcome?.key === key ? (outcome.error ?? null) : null,
  };
}
