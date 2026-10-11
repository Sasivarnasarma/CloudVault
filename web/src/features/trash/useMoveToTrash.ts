import { useCallback, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/cn';
import type { Entry } from '../../lib/entries';
import { entryPath } from '../../lib/paths';
import { moveToTrash, restoreFromTrash } from '../../services/trashService';
import { describeEntries } from '../files/bulkActions';
import type { UndoStack } from '../files/useUndoStack';

/** How long the "Undo" button stays on the toast. */
const UNDO_TOAST_MS = 8000;

interface Options {
  /** Called with the ids of entries that are now in the trash, so they leave the selection. */
  onMoved: (ids: string[]) => void;
  /** The folder's contents changed: load them again. */
  onRefresh: () => void;
  /** Offered for items that cannot go to the trash: delete them for good instead. */
  onDeleteForever: (entries: Entry[]) => void;
  /** Where the way to undo each delete is kept. */
  undoStack: Pick<UndoStack, 'push' | 'undo'>;
}

/**
 * "Delete" for files and folders: they go to the trash and a toast offers Undo (Ctrl+Z does the same,
 * through the undo stack).
 */
export function useMoveToTrash({ onMoved, onRefresh, onDeleteForever, undoStack }: Options) {
  const [busy, setBusy] = useState(false);

  /** Put a batch back where it was. */
  const undo = useCallback(
    async (batchId: string) => {
      try {
        const { restored, failed } = await restoreFromTrash(batchId);
        if (restored.length > 0) {
          toast.success(restored.length === 1 ? 'Restored 1 item' : `Restored ${restored.length} items`);
        }
        if (failed.length > 0) {
          toast.error(`Couldn’t restore “${failed[0].path.replace(/\/$/, '')}”`, {
            description: failed[0].error,
          });
        }
      } catch (err) {
        toast.error(errorMessage(err, 'Couldn’t undo the delete'));
      }
      onRefresh();
    },
    [onRefresh],
  );

  const request = useCallback(
    async (entries: Entry[]) => {
      if (entries.length === 0) return;
      setBusy(true);
      try {
        const { batch, failed } = await moveToTrash(entries.map((e) => ({ path: entryPath(e), type: e.type })));
        const failedPaths = new Set(failed.map((f) => f.path));
        const notMoved = entries.filter((e) => failedPaths.has(entryPath(e)));
        const moved = entries.filter((e) => !failedPaths.has(entryPath(e)));

        if (batch) {
          const undoId = undoStack.push(() => undo(batch.id));
          onMoved(moved.map((e) => e.id));
          toast.success(`Moved ${describeEntries(moved)} to the trash`, {
            duration: UNDO_TOAST_MS,
            action: { label: 'Undo', onClick: () => void undoStack.undo(undoId) },
          });
        }
        if (failed.length > 0) {
          toast.error(
            entries.length === 1
              ? `Couldn’t move “${entries[0].name}” to the trash`
              : `Couldn’t move ${failed.length} of ${entries.length} items to the trash`,
            {
              description: failed[0].error,
              duration: 10000,
              action: { label: 'Delete forever…', onClick: () => onDeleteForever(notMoved) },
            },
          );
        }
        onRefresh();
      } catch (err) {
        toast.error(errorMessage(err, 'Couldn’t move to the trash'));
      } finally {
        setBusy(false);
      }
    },
    [onMoved, onRefresh, onDeleteForever, undo, undoStack],
  );

  return { request, busy };
}
