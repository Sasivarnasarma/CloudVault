import { AlertCircle, Info } from 'lucide-react';
import { MAX_SEARCH_RESULTS } from '../../lib/limits';
import type { useDeepSearch } from './useDeepSearch';

/** A line above the results of a search of the subfolders: that it stopped early, or that it failed. */
export function SearchNotice({ search }: { search: ReturnType<typeof useDeepSearch> }) {
  if (!search.active) return null;
  if (search.error) {
    return (
      <p role="alert" className="flex items-center gap-2 border-b border-line px-5 py-2 text-sm text-danger">
        <AlertCircle className="size-4 shrink-0" />
        {search.error}
      </p>
    );
  }
  if (!search.response?.truncated) return null;
  return (
    <p role="status" className="flex items-center gap-2 border-b border-line bg-sunken/60 px-5 py-2 text-sm text-ink-3">
      <Info className="size-4 shrink-0" />
      Showing the first {MAX_SEARCH_RESULTS} matches. Type more of the name to narrow it down.
    </p>
  );
}
