import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/cn';
import type { Entry, TransferMode } from '../../lib/entries';
import type { Progress } from '../../services/http';
import type { BulkTransferTarget } from './BulkTransferDialog';
import {
  describeEntries,
  revertTransfers,
  runBulk,
  summarize,
  transferEntry,
  type TransferResult,
  type TransferRecord,
} from './bulkActions';
import type { UndoStack } from './useUndoStack';
import type { SelectionState } from './useSelection';
import type { TransferTarget } from './TransferDialog';

interface Options {
  selection: Pick<SelectionState, 'remove' | 'replace'>;
  onRefresh: () => void;
  undoStack: Pick<UndoStack, 'push' | 'undo'>;
}

/** How long the "Undo" button stays on the toast. */
const UNDO_TOAST_MS = 8000;

/**
 * Renaming, moving and copying. The dialogs (one item, or several) report back here to show the
 * result; `run` moves or copies items straight away for drag and drop and paste, with a spinner on
 * the moved items and a toast that turns from "Moving…" into the result.
 */
export function useTransfers({ selection, onRefresh, undoStack }: Options) {
  const [transfer, setTransfer] = useState<TransferTarget | null>(null);
  const [bulkTransfer, setBulkTransfer] = useState<BulkTransferTarget | null>(null);
  const [movingIds, setMovingIds] = useState<string[]>([]);
  const [transferring, setTransferring] = useState(false);

  /** Put what a move or a copy did back. */
  const undoTransfer = async (mode: 'move' | 'copy', records: TransferRecord[]) => {
    const toastId = toast.loading('Undoing…');
    const { undone, failed } = await revertTransfers(mode, records);
    const count = undone.length;
    if (count > 0) {
      const message =
        mode === 'move'
          ? `Moved ${count} ${count === 1 ? 'item' : 'items'} back`
          : count === 1
            ? 'Removed the copy'
            : `Removed ${count} copies`;
      toast.success(message, {
        id: toastId,
        description: undefined,
      });
    }
    if (failed.length > 0) {
      toast.error(`Couldn’t undo ${failed.length === 1 ? 'one item' : `${failed.length} items`}`, {
        id: undone.length === 0 ? toastId : undefined,
        description: failed[0].error,
      });
    }
    onRefresh();
  };

  /** Remember how to undo a move or a copy, and give back the toast action that does it. */
  const undoable = (mode: 'move' | 'copy', records: TransferRecord[]) => {
    if (records.length === 0) return {};
    const id = undoStack.push(() => undoTransfer(mode, records));
    return { duration: UNDO_TOAST_MS, action: { label: 'Undo', onClick: () => void undoStack.undo(id) } };
  };

  /** A rename, move or copy of one item finished in its dialog. */
  const onTransferDone = ({ mode, entry, destination }: { mode: TransferMode; entry: Entry; destination: string }) => {
    const verb = { rename: 'Renamed', move: 'Moved', copy: 'Copied' }[mode];
    const target = destination.replace(/\/+$/, '');
    const record: TransferRecord = {
      type: entry.type,
      from: entry.type === 'folder' ? entry.folder.prefix : entry.file.key,
      to: entry.type === 'folder' ? `${target}/` : target,
    };
    toast.success(
      mode === 'rename' ? `${verb} to “${target.split('/').pop()}”` : `${verb} “${entry.name}” to ${target}`,
      undoable(mode === 'copy' ? 'copy' : 'move', [record]),
    );
    if (mode !== 'copy') selection.remove([entry.id]);
    onRefresh();
  };

  /** Several items were moved or copied. `toastId` is a loading toast to turn into the result. */
  const onBulkTransferDone = (mode: 'move' | 'copy', results: TransferResult[], toastId?: string | number) => {
    const { succeeded, failed } = summarize(results);
    const verb = mode === 'move' ? 'Moved' : 'Copied';
    let id = toastId;
    const takeId = () => {
      const current = id;
      id = undefined;
      return current;
    };

    if (succeeded.length > 0) {
      const records = succeeded.flatMap((r) => (r.value ? [r.value] : []));
      toast.success(`${verb} ${describeEntries(succeeded.map((r) => r.entry))}`, {
        id: takeId(),
        description: undefined,
        ...undoable(mode, records),
      });
    }
    if (failed.length > 0) {
      const what =
        results.length === 1
          ? `“${failed[0].entry.name}”`
          : failed.length === results.length
            ? `any of the ${results.length} items`
            : `${failed.length} of ${results.length} items`;
      toast.error(`Couldn’t ${mode} ${what}`, { description: failed[0].error, id: takeId() });
    }
    if (id !== undefined) toast.dismiss(id);

    selection.replace(failed.map((r) => r.entry.id));
    onRefresh();
  };

  /**
   * Move or copy `items` into the folder `destination`. `nameFor` gives an item another name (a copy
   * made next to its original). Returns what happened to each item, or null if it could not start.
   */
  const run = async (
    items: Entry[],
    mode: 'move' | 'copy',
    destination: string,
    nameFor?: (entry: Entry) => string | undefined,
  ): Promise<TransferResult[] | null> => {
    setTransferring(true);
    setMovingIds(mode === 'move' ? items.map((e) => e.id) : []);
    const controller = new AbortController();
    const what = `${mode === 'move' ? 'Moving' : 'Copying'} ${describeEntries(items)}`;
    // Folders report how many files they have copied; the toast adds them up.
    const progress = new Map<string, Progress>();
    const toastId = toast.loading(`${what}…`, { action: { label: 'Cancel', onClick: () => controller.abort() } });
    const showProgress = () => {
      let done = 0;
      let total = 0;
      progress.forEach((p) => {
        done += p.done;
        total += p.total;
      });
      toast.loading(`${what}…`, {
        id: toastId,
        description: total > 0 ? `${done.toLocaleString()} of ${total.toLocaleString()} files` : undefined,
        action: { label: 'Cancel', onClick: () => controller.abort() },
      });
    };
    try {
      const results = await runBulk(items, (entry) =>
        transferEntry(entry, mode, destination, false, nameFor?.(entry), {
          signal: controller.signal,
          onProgress: (p) => {
            progress.set(entry.id, p);
            showProgress();
          },
        }),
      );
      if (controller.signal.aborted) {
        const finished = results.filter((r) => r.ok);
        toast.info(
          finished.length > 0
            ? `Stopped. ${describeEntries(finished.map((r) => r.entry))} had already been ${mode === 'move' ? 'moved' : 'copied'}.`
            : 'Stopped. Nothing was changed.',
          { id: toastId, description: undefined },
        );
        selection.replace(results.filter((r) => !r.ok).map((r) => r.entry.id));
        onRefresh();
        return results;
      }
      onBulkTransferDone(mode, results, toastId);
      return results;
    } catch (err) {
      toast.error(errorMessage(err, `Couldn’t ${mode} the items`), { id: toastId, description: undefined });
      return null;
    } finally {
      setMovingIds([]);
      setTransferring(false);
    }
  };

  return {
    transfer,
    openTransfer: setTransfer,
    bulkTransfer,
    openBulkTransfer: setBulkTransfer,
    onTransferDone,
    onBulkTransferDone,
    run,
    movingIds,
    transferring,
  };
}

export type Transfers = ReturnType<typeof useTransfers>;
