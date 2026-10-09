import { Loader2 } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Button } from '../../components/common/Button';
import { Dialog } from '../../components/common/Dialog';
import type { Entry } from '../../lib/entries';
import { describeEntries, runBulk, summarize, transferEntry, type BulkResult } from './bulkActions';
import { FolderPicker } from './FolderPicker';

export interface BulkTransferTarget {
  mode: 'move' | 'copy';
  entries: Entry[];
}

interface BulkTransferDialogProps {
  target: BulkTransferTarget | null;
  /** Folder the picker opens in (usually the folder being viewed). */
  startPrefix: string;
  onClose: () => void;
  /** Called once every item has been attempted, whether or not all of them worked. */
  onDone: (mode: 'move' | 'copy', results: BulkResult[]) => void;
}

function BulkTransferForm({
  mode,
  entries,
  startPrefix,
  onClose,
  onDone,
}: BulkTransferTarget & Pick<BulkTransferDialogProps, 'startPrefix' | 'onClose' | 'onDone'>) {
  const [prefix, setPrefix] = useState(startPrefix);
  const [replace, setReplace] = useState(false);
  const [progress, setProgress] = useState<{ done: number; total: number } | null>(null);
  const [failures, setFailures] = useState<BulkResult[] | null>(null);

  const hasFiles = entries.some((e) => e.type === 'file');
  const excluded = useMemo(
    () => entries.filter((e) => e.type === 'folder').map((e) => (e.type === 'folder' ? e.folder.prefix : '')),
    [entries],
  );
  const verb = mode === 'move' ? 'Move' : 'Copy';
  const running = progress !== null && failures === null;

  const submit = async () => {
    setProgress({ done: 0, total: entries.length });
    const results = await runBulk(entries, (entry) => transferEntry(entry, mode, prefix, replace), {
      onProgress: (done, total) => setProgress({ done, total }),
    });
    const { failed } = summarize(results);
    onDone(mode, results);
    if (failed.length === 0) onClose();
    else setFailures(failed);
  };

  if (failures) {
    return (
      <div>
        <p className="mb-3 text-sm text-ink-2">
          {entries.length - failures.length} of {entries.length} items were {mode === 'move' ? 'moved' : 'copied'}.
          These {failures.length === 1 ? 'one' : failures.length} couldn’t be:
        </p>
        <ul className="max-h-56 divide-y divide-line overflow-y-auto rounded-xl border border-line">
          {failures.map(({ entry, error }) => (
            <li key={entry.id} className="px-3 py-2 text-sm">
              <span className="font-medium text-ink">{entry.name}</span>
              <span className="block text-xs text-danger">{error}</span>
            </li>
          ))}
        </ul>
        <div className="mt-6 flex justify-end">
          <Button variant="primary" onClick={onClose}>
            Close
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div>
      <p className="mb-1.5 text-sm font-medium text-ink">Destination folder</p>
      <FolderPicker prefix={prefix} onNavigate={setPrefix} excludedPrefixes={excluded} />
      <p className="mt-2 break-all text-xs text-ink-3">Into: {prefix || 'All files'}</p>

      {hasFiles && (
        <label className="mt-4 flex cursor-pointer items-center gap-2.5 text-sm text-ink-2">
          <input
            type="checkbox"
            checked={replace}
            disabled={running}
            onChange={(e) => setReplace(e.target.checked)}
            className="size-4 accent-[var(--accent)]"
          />
          Replace files that already exist
        </label>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={running}>
          Cancel
        </Button>
        <Button variant="primary" onClick={submit} disabled={running}>
          {running && <Loader2 className="size-4 animate-spin" />}
          {running ? `${verb === 'Move' ? 'Moving' : 'Copying'} ${progress.done} of ${progress.total}…` : `${verb} here`}
        </Button>
      </div>
    </div>
  );
}

export function BulkTransferDialog({ target, startPrefix, onClose, onDone }: BulkTransferDialogProps) {
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title={target ? `${target.mode === 'move' ? 'Move' : 'Copy'} ${target.entries.length} items` : ''}
      description={target ? describeEntries(target.entries) : undefined}
      className="max-w-lg"
    >
      {target && (
        <BulkTransferForm
          key={`${target.mode}:${target.entries.map((e) => e.id).join('|')}`}
          mode={target.mode}
          entries={target.entries}
          startPrefix={startPrefix}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </Dialog>
  );
}
