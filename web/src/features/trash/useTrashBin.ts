import { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/cn';
import { deleteFromTrash, emptyTrash, listTrash, restoreFromTrash } from '../../services/trashService';
import type { TrashBatch } from '../../types';

interface Options {
  /** Called after something went back to the files, so the folder being viewed can be loaded again. */
  onRestored: () => void;
}

/** What is in the trash, and putting things back or removing them for good. */
export function useTrashBin({ onRestored }: Options) {
  const [batches, setBatches] = useState<TrashBatch[]>([]);
  const [totalSize, setTotalSize] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  /** The batch an action is working on, or 'all' while the trash is being emptied. */
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await listTrash();
      setBatches(result.batches);
      setTotalSize(result.total_size);
      setError(null);
    } catch (err) {
      setError(errorMessage(err, 'Failed to load the trash'));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    // Loads data: state changes when the request settles.
    // oxlint-disable-next-line react/set-state-in-effect
    load();
  }, [load]);

  const reload = useCallback(() => {
    setLoading(true);
    return load();
  }, [load]);

  /** Run an action on a batch (or everything), then show the trash as it is now. */
  const act = useCallback(
    async (id: string, action: () => Promise<void>) => {
      setBusyId(id);
      try {
        await action();
      } catch (err) {
        toast.error(errorMessage(err, 'Something went wrong'));
      } finally {
        setBusyId(null);
        await load();
      }
    },
    [load],
  );

  /** Put a batch back, or only some of its items. */
  const restore = useCallback(
    (batch: TrashBatch, paths?: string[]) =>
      act(batch.id, async () => {
        const { restored, failed } = await (paths ? restoreFromTrash(batch.id, paths) : restoreFromTrash(batch.id));
        if (restored.length > 0) {
          toast.success(restored.length === 1 ? 'Restored 1 item' : `Restored ${restored.length} items`);
          onRestored();
        }
        if (failed.length > 0) {
          toast.error(`Couldn’t restore “${failed[0].path.replace(/\/$/, '')}”`, { description: failed[0].error });
        }
      }),
    [act, onRestored],
  );

  /** Delete a batch for good, or only some of its items. */
  const remove = useCallback(
    (batch: TrashBatch, paths?: string[]) =>
      act(batch.id, async () => {
        await (paths ? deleteFromTrash(batch.id, paths) : deleteFromTrash(batch.id));
        toast.success('Deleted for good');
      }),
    [act],
  );

  const empty = useCallback(
    () =>
      act('all', async () => {
        await emptyTrash();
        toast.success('The trash is empty');
      }),
    [act],
  );

  return { batches, totalSize, loading, error, busyId, reload, restore, remove, empty };
}
