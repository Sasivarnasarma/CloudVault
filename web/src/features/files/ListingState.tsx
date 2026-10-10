import { AlertCircle, RefreshCw } from 'lucide-react';
import type { ReactNode } from 'react';
import { Button } from '../../components/common/Button';
import { StateMessage } from '../../components/common/StateMessage';
import { EmptyFolderState } from './EmptyFolderState';
import type { ViewMode } from './FileBrowser';
import { FileSkeleton } from './FileSkeleton';

interface ListingStateProps {
  error: string | null;
  loading: boolean;
  /** No entries to show (nothing in the folder, or nothing that matches the filters). */
  empty: boolean;
  /** The search or a category filter is hiding entries. */
  filtered: boolean;
  view: ViewMode;
  onRetry: () => void;
  onClearFilters: () => void;
  /** The listing itself, shown when there is something to show. */
  children: ReactNode;
}

/** Shows the right thing for the folder: an error, a skeleton while loading, an empty message or the listing. */
export function ListingState({ error, loading, empty, filtered, view, onRetry, onClearFilters, children }: ListingStateProps) {
  if (error) {
    return (
      <StateMessage icon={AlertCircle} tone="danger" title="Unable to load files" description={error}>
        <Button className="mt-5" onClick={onRetry}>
          <RefreshCw className="size-4" />
          Try again
        </Button>
      </StateMessage>
    );
  }
  if (loading) return <FileSkeleton view={view} />;
  if (empty) return <EmptyFolderState filtered={filtered} onClearFilters={onClearFilters} />;
  return <>{children}</>;
}
