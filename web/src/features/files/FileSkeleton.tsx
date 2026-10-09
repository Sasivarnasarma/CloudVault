import { cn } from '../../lib/cn';

export function FileSkeleton({ view }: { view: 'grid' | 'list' }) {
  const bar = 'animate-pulse rounded-md bg-sunken';
  if (view === 'grid') {
    return (
      <div
        role="status"
        aria-label="Loading files"
        className="grid grid-cols-[repeat(auto-fill,minmax(10.5rem,1fr))] gap-3 p-5"
      >
        {Array.from({ length: 10 }, (_, i) => (
          <div key={i} className="rounded-2xl border border-line bg-surface p-4">
            <div className={cn(bar, 'mb-6 size-12 rounded-xl')} />
            <div className={cn(bar, 'mb-2 h-3.5 w-3/4')} />
            <div className={cn(bar, 'h-3 w-1/2')} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div role="status" aria-label="Loading files" className="divide-y divide-line px-2">
      {Array.from({ length: 8 }, (_, i) => (
        <div key={i} className="flex items-center gap-3 px-4 py-3">
          <div className={cn(bar, 'size-8 rounded-lg')} />
          <div className={cn(bar, 'h-3.5 flex-1 max-w-64')} />
          <div className={cn(bar, 'ml-auto hidden h-3 w-16 sm:block')} />
        </div>
      ))}
    </div>
  );
}
