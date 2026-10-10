import { useEffect, useRef } from 'react';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';

interface LoadMoreProps {
  hasMore: boolean;
  loading: boolean;
  error: string | null;
  loadedCount: number;
  onLoadMore: () => void;
}

/**
 * Sits below a long listing. Loads the next page automatically when scrolled into view,
 * and offers an explicit button for keyboard users, failures and browsers without observers.
 */
export function LoadMore({ hasMore, loading, error, loadedCount, onLoadMore }: LoadMoreProps) {
  const sentinel = useRef<HTMLDivElement>(null);
  const onLoadMoreRef = useRef(onLoadMore);

  useEffect(() => {
    onLoadMoreRef.current = onLoadMore;
  }, [onLoadMore]);

  useEffect(() => {
    const node = sentinel.current;
    if (!node || !hasMore || loading || error || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) onLoadMoreRef.current();
      },
      { rootMargin: '400px' },
    );
    observer.observe(node);
    return () => observer.disconnect();
  }, [hasMore, loading, error, loadedCount]);

  if (!hasMore && !loading) return null;

  return (
    <div ref={sentinel} className="flex flex-col items-center gap-2 px-5 py-6 text-sm text-ink-3">
      {error && (
        <p role="alert" className="text-danger">
          {error}
        </p>
      )}
      {loading ? (
        <span role="status" className="flex items-center gap-2">
          <Spinner />
          Loading more…
        </span>
      ) : (
        <>
          <span>Showing the first {loadedCount} items</span>
          <Button variant="secondary" onClick={onLoadMore}>
            {error ? 'Try again' : 'Load more'}
          </Button>
        </>
      )}
    </div>
  );
}
