import { useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/cn';
import type { Entry, TransferMode } from '../../lib/entries';
import type { BulkTransferTarget } from './BulkTransferDialog';
import { describeEntries, runBulk, summarize, transferEntry, type BulkResult } from './bulkActions';
import type { SelectionState } from './useSelection';
import type { TransferTarget } from './TransferDialog';

interface Options {
  selection: Pick<SelectionState, 'remove' | 'replace'>;
  onRefresh: () => void;
}

/**
 * Renaming, moving and copying. The dialogs (one item, or several) report back here to show the
 * result; `run` moves or copies items straight away for drag and drop and paste, with a spinner on
 * the moved items and a toast that turns from "Moving…" into the result.
 */
export function useTransfers({ selection, onRefresh }: Options) {
  const [transfer, setTransfer] = useState<TransferTarget | null>(null);
  const [bulkTransfer, setBulkTransfer] = useState<BulkTransferTarget | null>(null);
  const [movingIds, setMovingIds] = useState<string[]>([]);
  const [transferring, setTransferring] = useState(false);

  /** A rename, move or copy of one item finished in its dialog. */
  const onTransferDone = ({ mode, entry, destination }: { mode: TransferMode; entry: Entry; destination: string }) => {
    const verb = { rename: 'Renamed', move: 'Moved', copy: 'Copied' }[mode];
    const target = destination.replace(/\/+$/, '');
    toast.success(mode === 'rename' ? `${verb} to “${target.split('/').pop()}”` : `${verb} “${entry.name}” to ${target}`);
    if (mode !== 'copy') selection.remove([entry.id]);
    onRefresh();
  };

  /** Several items were moved or copied. `toastId` is a loading toast to turn into the result. */
  const onBulkTransferDone = (mode: 'move' | 'copy', results: BulkResult[], toastId?: string | number) => {
    const { succeeded, failed } = summarize(results);
    const verb = mode === 'move' ? 'Moved' : 'Copied';
    let id = toastId;
    const takeId = () => {
      const current = id;
      id = undefined;
      return current;
    };

    if (succeeded.length > 0) toast.success(`${verb} ${describeEntries(succeeded.map((r) => r.entry))}`, { id: takeId() });
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
  ): Promise<BulkResult[] | null> => {
    setTransferring(true);
    setMovingIds(mode === 'move' ? items.map((e) => e.id) : []);
    const toastId = toast.loading(`${mode === 'move' ? 'Moving' : 'Copying'} ${describeEntries(items)}…`);
    try {
      const results = await runBulk(items, (entry) => transferEntry(entry, mode, destination, false, nameFor?.(entry)));
      onBulkTransferDone(mode, results, toastId);
      return results;
    } catch (err) {
      toast.error(errorMessage(err, `Couldn’t ${mode} the items`), { id: toastId });
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
