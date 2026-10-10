import { useState, type FormEvent } from 'react';
import { Button } from '../../components/common/Button';
import { Dialog } from '../../components/common/Dialog';
import { errorMessage } from '../../lib/cn';
import { createFolder } from '../../services/folderService';
import { Spinner } from '../../components/common/Spinner';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPrefix: string;
  onFolderCreated: (name: string) => void;
}

function validateFolderName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a folder name.';
  if (/[/\\:*?"<>|]/.test(trimmed)) return 'Names can’t contain / \\ : * ? " < > |';
  if (trimmed === '.' || trimmed === '..') return 'That name isn’t allowed.';
  return null;
}

export function CreateFolderModal({ isOpen, onClose, targetPrefix, onFolderCreated }: CreateFolderModalProps) {
  const [folderName, setFolderName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const close = () => {
    if (loading) return;
    setFolderName('');
    setError(null);
    onClose();
  };

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const invalid = validateFolderName(folderName);
    if (invalid) {
      setError(invalid);
      return;
    }
    const name = folderName.trim();
    const base = targetPrefix ? targetPrefix.replace(/\/+$/, '') + '/' : '';

    setLoading(true);
    setError(null);
    try {
      await createFolder(`${base}${name}`);
      setFolderName('');
      onFolderCreated(name);
      onClose();
    } catch (err) {
      setError(errorMessage(err, 'Couldn’t create the folder.'));
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => !open && close()}
      title="New folder"
      description={`Created in ${targetPrefix || 'the root of your bucket'}`}
    >
      <form onSubmit={submit} noValidate>
        <label htmlFor="folder-name" className="mb-1.5 block text-sm font-medium text-ink">
          Folder name
        </label>
        <input
          id="folder-name"
          autoFocus
          autoComplete="off"
          value={folderName}
          onChange={(e) => {
            setFolderName(e.target.value);
            if (error) setError(null);
          }}
          placeholder="project-documents"
          aria-invalid={!!error}
          aria-describedby={error ? 'folder-name-error' : undefined}
          className="h-10 w-full rounded-lg border border-line-strong bg-surface px-3 text-sm text-ink placeholder:text-ink-3 focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/25 aria-invalid:border-danger"
        />
        {error && (
          <p id="folder-name-error" role="alert" className="mt-2 text-sm text-danger">
            {error}
          </p>
        )}
        <div className="mt-6 flex justify-end gap-2">
          <Button variant="secondary" onClick={close} disabled={loading}>
            Cancel
          </Button>
          <Button type="submit" variant="primary" disabled={loading || !folderName.trim()}>
            {loading && <Spinner />}
            Create folder
          </Button>
        </div>
      </form>
    </Dialog>
  );
}
