import { Loader2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { Button } from '../../components/common/Button';
import { Dialog } from '../../components/common/Dialog';
import { errorMessage } from '../../lib/cn';
import type { Entry, TransferMode } from '../../lib/entries';
import { entryPath, parentPrefix, validateEntryName } from '../../lib/paths';
import { copyFolder, moveFolder } from '../../services/folderService';
import { ApiError } from '../../services/http';
import { copyObject, moveObject } from '../../services/objectService';
import { FolderPicker } from './FolderPicker';

export interface TransferTarget {
  entry: Entry;
  mode: TransferMode;
}

interface TransferDialogProps {
  target: TransferTarget | null;
  /** Folder the picker opens in for move/copy (usually the folder being viewed). */
  startPrefix: string;
  onClose: () => void;
  onDone: (result: { mode: TransferMode; entry: Entry; destination: string }) => void;
}

const COPY: Record<TransferMode, { title: string; submit: string; busy: string }> = {
  rename: { title: 'Rename', submit: 'Rename', busy: 'Renaming…' },
  move: { title: 'Move to…', submit: 'Move here', busy: 'Moving…' },
  copy: { title: 'Copy to…', submit: 'Copy here', busy: 'Copying…' },
};

async function runTransfer(entry: Entry, mode: TransferMode, destination: string, overwrite: boolean) {
  if (entry.type === 'folder') {
    const to = destination.replace(/\/+$/, '');
    const from = entry.folder.prefix;
    return mode === 'copy' ? copyFolder(from, to) : moveFolder(from, to);
  }
  return mode === 'copy'
    ? copyObject(entry.file.key, destination, overwrite)
    : moveObject(entry.file.key, destination, overwrite);
}

function TransferForm({
  entry,
  mode,
  startPrefix,
  onClose,
  onDone,
}: { entry: Entry; mode: TransferMode; startPrefix: string } & Pick<TransferDialogProps, 'onClose' | 'onDone'>) {
  const source = entryPath(entry);
  const isFolder = entry.type === 'folder';
  const picksFolder = mode !== 'rename';

  const [browsePrefix, setBrowsePrefix] = useState(picksFolder ? startPrefix : parentPrefix(source));
  const [name, setName] = useState(entry.name);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<{ message: string; conflict: boolean } | null>(null);

  const parent = picksFolder ? browsePrefix : parentPrefix(source);
  const destination = `${parent}${name.trim()}${isFolder ? '/' : ''}`;

  const nameError = name ? validateEntryName(name) : null;
  const insideSource = isFolder && destination.startsWith(source);
  const unchanged = destination === source;
  const hint = nameError
    ? nameError
    : insideSource
      ? 'A folder can’t be moved or copied into itself.'
      : unchanged
        ? mode === 'rename'
          ? 'Enter a different name.'
          : 'Choose a different folder or name.'
        : null;
  const canSubmit = !!name.trim() && !hint && !loading;

  const submit = async (overwrite = false) => {
    if (!canSubmit) return;
    setLoading(true);
    setError(null);
    try {
      await runTransfer(entry, mode, destination, overwrite);
      onDone({ mode, entry, destination });
      onClose();
    } catch (err) {
      const conflict = err instanceof ApiError && err.status === 409 && !isFolder;
      setError({ message: errorMessage(err, `Couldn’t ${mode} ${isFolder ? 'folder' : 'file'}.`), conflict });
    } finally {
      setLoading(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    submit();
  };

  return (
    <form onSubmit={onSubmit} noValidate>
      {picksFolder && (
        <div className="mb-4">
          <p className="mb-1.5 text-sm font-medium text-ink">Destination folder</p>
          <FolderPicker
            prefix={browsePrefix}
            onNavigate={(prefix) => {
              setBrowsePrefix(prefix);
              setError(null);
            }}
            excludedPrefix={isFolder ? source : undefined}
          />
        </div>
      )}

      <label htmlFor="entry-name" className="mb-1.5 block text-sm font-medium text-ink">
        Name
      </label>
      <input
        id="entry-name"
        autoFocus={!picksFolder}
        autoComplete="off"
        value={name}
        onChange={(e) => {
          setName(e.target.value);
          setError(null);
        }}
        onFocus={(e) => !picksFolder && e.currentTarget.select()}
        aria-invalid={!!nameError}
        aria-describedby="entry-name-help"
        className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-invalid:border-danger"
      />
      <p id="entry-name-help" className={`mt-2 break-all text-xs ${hint ? 'text-danger' : 'text-ink-3'}`}>
        {hint ?? `Result: ${destination}`}
      </p>

      {error && (
        <div role="alert" className="mt-3 rounded-lg bg-danger-soft px-3 py-2 text-sm text-danger">
          <p>{error.message}</p>
          {error.conflict && (
            <Button variant="danger" className="mt-2 h-8 text-xs" disabled={loading} onClick={() => submit(true)}>
              Replace existing file
            </Button>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end gap-2">
        <Button variant="secondary" onClick={onClose} disabled={loading}>
          Cancel
        </Button>
        <Button type="submit" variant="primary" disabled={!canSubmit}>
          {loading && <Loader2 className="size-4 animate-spin" />}
          {loading ? COPY[mode].busy : COPY[mode].submit}
        </Button>
      </div>
    </form>
  );
}

export function TransferDialog({ target, startPrefix, onClose, onDone }: TransferDialogProps) {
  const what = target?.entry.type === 'folder' ? 'folder' : 'file';
  return (
    <Dialog
      open={!!target}
      onOpenChange={(open) => !open && onClose()}
      title={target ? COPY[target.mode].title : ''}
      description={target ? `${what[0].toUpperCase()}${what.slice(1)}: ${target.entry.name}` : undefined}
      className="max-w-lg"
    >
      {target && (
        <TransferForm
          key={`${target.mode}:${entryPath(target.entry)}`}
          entry={target.entry}
          mode={target.mode}
          startPrefix={startPrefix}
          onClose={onClose}
          onDone={onDone}
        />
      )}
    </Dialog>
  );
}
