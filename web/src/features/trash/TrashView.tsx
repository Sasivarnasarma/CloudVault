import { AlertCircle, Menu, RefreshCw, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { Button, IconButton } from '../../components/common/Button';
import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import { StateMessage } from '../../components/common/StateMessage';
import { formatBytes } from '../../lib/formatters';
import type { TrashBatch } from '../../types';
import { FileSkeleton } from '../files/FileSkeleton';
import { TrashBatchCard } from './TrashBatchCard';
import { useTrashBin } from './useTrashBin';

interface TrashViewProps {
  onRestored: () => void;
  onOpenNav: () => void;
}

/** The trash: everything that was deleted, with Restore, Delete forever and Empty trash. */
export function TrashView({ onRestored, onOpenNav }: TrashViewProps) {
  const trash = useTrashBin({ onRestored });
  // What the user is being asked to confirm: one batch, or all of them.
  const [confirming, setConfirming] = useState<TrashBatch | 'all' | null>(null);

  const itemCount = trash.batches.reduce((sum, b) => sum + b.roots.length, 0);
  const working = trash.busyId !== null;

  const confirm = async () => {
    const target = confirming;
    setConfirming(null);
    if (target === 'all') await trash.empty();
    else if (target) await trash.remove(target);
  };

  return (
    <div className="flex min-w-0 flex-1 flex-col">
      <header className="flex items-center gap-2 border-b border-line bg-canvas/80 px-4 py-3 backdrop-blur sm:px-5">
        <IconButton label="Open navigation" className="lg:hidden" onClick={onOpenNav}>
          <Menu className="size-5" />
        </IconButton>
        <div className="min-w-0 flex-1">
          <h1 className="text-base font-semibold tracking-tight text-ink">Trash</h1>
          {!trash.loading && !trash.error && trash.batches.length > 0 && (
            <p className="text-xs text-ink-3">
              {itemCount} item{itemCount === 1 ? '' : 's'} · {formatBytes(trash.totalSize, 1)}
            </p>
          )}
        </div>
        <IconButton label="Refresh the trash" onClick={() => void trash.reload()} disabled={working}>
          <RefreshCw className="size-4" />
        </IconButton>
        <Button variant="danger" onClick={() => setConfirming('all')} disabled={working || trash.batches.length === 0}>
          <Trash2 className="size-4" />
          Empty trash
        </Button>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto" aria-busy={trash.loading}>
        {trash.error ? (
          <StateMessage icon={AlertCircle} tone="danger" title="Unable to load the trash" description={trash.error}>
            <Button className="mt-5" onClick={() => void trash.reload()}>
              <RefreshCw className="size-4" />
              Try again
            </Button>
          </StateMessage>
        ) : trash.loading ? (
          <FileSkeleton view="list" />
        ) : trash.batches.length === 0 ? (
          <StateMessage
            icon={Trash2}
            title="The trash is empty"
            description="Files and folders you delete wait here until you restore them or empty the trash."
          />
        ) : (
          <ul aria-label="Deleted items" className="mx-auto max-w-3xl space-y-3 p-4 sm:p-5">
            {trash.batches.map((batch) => (
              <TrashBatchCard
                key={batch.id}
                batch={batch}
                busy={trash.busyId === batch.id}
                disabled={working}
                onRestore={() => void trash.restore(batch)}
                onDelete={() => setConfirming(batch)}
              />
            ))}
          </ul>
        )}
      </main>

      <ConfirmDialog
        open={confirming !== null}
        title={confirming === 'all' ? 'Empty the trash?' : 'Delete forever?'}
        description={
          confirming === 'all'
            ? `Everything in the trash (${itemCount} item${itemCount === 1 ? '' : 's'}) will be permanently deleted. This can’t be undone.`
            : 'These items will be permanently deleted. This can’t be undone.'
        }
        confirmLabel={confirming === 'all' ? 'Empty trash' : 'Delete forever'}
        onConfirm={() => void confirm()}
        onCancel={() => setConfirming(null)}
      />
    </div>
  );
}
