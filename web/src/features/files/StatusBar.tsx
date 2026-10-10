import { formatBytes } from '../../lib/formatters';

interface StatusBarProps {
  folderCount: number;
  fileCount: number;
  totalSize: number;
  /** More items exist than the ones loaded so far, so the counts get a "+". */
  hasMore: boolean;
  /** How many entries are left after the search and filters; only shown while they are active. */
  shown?: number;
}

export function StatusBar({ folderCount, fileCount, totalSize, hasMore, shown }: StatusBarProps) {
  const more = hasMore ? '+' : '';
  return (
    <footer className="flex items-center gap-3 border-t border-line bg-surface px-5 py-2 text-xs text-ink-3">
      <span>
        {folderCount}
        {more} folder{folderCount === 1 ? '' : 's'}, {fileCount}
        {more} file{fileCount === 1 ? '' : 's'}
      </span>
      <span aria-hidden="true">·</span>
      <span className="font-mono">{formatBytes(totalSize, 1)}</span>
      {shown !== undefined && <span className="ml-auto">{shown} shown</span>}
    </footer>
  );
}
