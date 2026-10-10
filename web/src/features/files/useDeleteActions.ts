import { useState } from 'react';
import { toast } from 'sonner';
import type { Entry } from '../../lib/entries';
import { deleteEntry, describeEntries, runBulk, summarize } from './bulkActions';

/** Deleting one item or several: ask first (`request`), then delete when the user confirms. */
export function useDeleteActions({
  onDeleted,
  onRefresh,
}: {
  /** Called with the ids of the entries that are gone, so they can leave the selection. */
  onDeleted: (ids: string[]) => void;
  onRefresh: () => void;
}) {
  const [pending, setPending] = useState<Entry[] | null>(null);
  const [deleting, setDeleting] = useState(false);

  const confirm = async () => {
    if (!pending) return;
    setDeleting(true);
    const results = await runBulk(pending, deleteEntry);
    setDeleting(false);

    const { succeeded, failed } = summarize(results);
    onDeleted(succeeded.map((r) => r.entry.id));

    if (succeeded.length > 0) {
      const [only] = succeeded.length === 1 && pending.length === 1 ? succeeded : [];
      toast.success(
        only
          ? `Deleted “${only.entry.name}”${only.entry.type === 'folder' ? ` (${only.value} items)` : ''}`
          : `Deleted ${describeEntries(succeeded.map((r) => r.entry))}`,
      );
      onRefresh();
    }
    if (failed.length > 0) {
      toast.error(
        pending.length === 1
          ? `Couldn’t delete “${failed[0].entry.name}”`
          : `Couldn’t delete ${failed.length} of ${results.length} items`,
        { description: failed[0].error },
      );
    }

    // One item that failed stays in the dialog so it can be tried again.
    if (pending.length > 1 || failed.length === 0) setPending(null);
  };

  return { pending, deleting, request: setPending, cancel: () => setPending(null), confirm };
}
