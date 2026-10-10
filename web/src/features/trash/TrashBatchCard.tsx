import { RotateCcw, Trash2 } from 'lucide-react';
import { Button } from '../../components/common/Button';
import { Spinner } from '../../components/common/Spinner';
import { formatBytes, formatDate, formatRelativeDate } from '../../lib/formatters';
import { FileIcon, FolderIcon } from '../files/FileIcon';
import type { TrashBatch, TrashRoot } from '../../types';

/** Where a deleted item was: its folder, then its name. */
function Location({ root }: { root: TrashRoot }) {
  const parts = root.path.replace(/\/$/, '').split('/');
  const name = parts.pop() ?? root.path;
  const folder = parts.length > 0 ? `${parts.join('/')}/` : '';
  return (
    <span className="min-w-0 truncate" title={root.path}>
      {folder && <span className="text-ink-3">{folder}</span>}
      <span className="font-medium text-ink">{name}</span>
    </span>
  );
}

interface TrashBatchCardProps {
  batch: TrashBatch;
  /** Something is already happening to this batch. */
  busy: boolean;
  /** Another action is running, so the buttons wait. */
  disabled: boolean;
  onRestore: () => void;
  onDelete: () => void;
}

/** One delete: what went to the trash together, when, and what to do with it. */
export function TrashBatchCard({ batch, busy, disabled, onRestore, onDelete }: TrashBatchCardProps) {
  return (
    <li
      aria-label={`Deleted ${formatDate(batch.deleted_at)}`}
      className="rounded-2xl border border-line bg-surface p-4"
      aria-busy={busy || undefined}
    >
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="min-w-0 flex-1 text-sm">
          <span className="font-medium text-ink" title={formatDate(batch.deleted_at)}>
            Deleted {formatRelativeDate(batch.deleted_at).toLowerCase()}
          </span>
          <span className="ml-2 font-mono text-xs text-ink-3">{formatBytes(batch.total_size, 1)}</span>
        </div>
        <div className="flex items-center gap-1.5">
          <Button variant="secondary" onClick={onRestore} disabled={disabled}>
            {busy ? <Spinner /> : <RotateCcw className="size-4" />}
            Restore
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={onDelete}
            disabled={disabled}
          >
            <Trash2 className="size-4" />
            Delete forever
          </Button>
        </div>
      </div>

      <ul className="mt-3 divide-y divide-line/60 border-t border-line/60">
        {batch.roots.map((root) => (
          <li key={root.path} className="flex items-center gap-3 py-2 text-sm">
            {root.type === 'folder' ? (
              <FolderIcon size="sm" />
            ) : (
              <FileIcon file={{ name: root.path.split('/').pop() ?? root.path, content_type: '' }} size="sm" />
            )}
            <Location root={root} />
            <span className="ml-auto shrink-0 font-mono text-xs text-ink-3">
              {root.type === 'folder'
                ? `${root.item_count} file${root.item_count === 1 ? '' : 's'} · ${formatBytes(root.size, 1)}`
                : formatBytes(root.size, 1)}
            </span>
          </li>
        ))}
      </ul>
    </li>
  );
}
