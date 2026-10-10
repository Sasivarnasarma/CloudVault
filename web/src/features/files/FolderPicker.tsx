import { useEffect, useState } from 'react';
import { Breadcrumbs } from '../../components/common/Breadcrumbs';
import { errorMessage } from '../../lib/cn';
import { listObjects } from '../../services/objectService';
import type { FolderObject } from '../../types';
import { FolderIcon } from './FileIcon';
import { Spinner } from '../../components/common/Spinner';

interface FolderPickerProps {
  prefix: string;
  onNavigate: (prefix: string) => void;
  /** A folder that cannot be chosen or entered (the folder being moved). */
  excludedPrefix?: string;
  /** Several such folders, when more than one is being moved at once. */
  excludedPrefixes?: readonly string[];
}

/** Lets the user browse the bucket's folders and pick a destination. */
export function FolderPicker({ prefix, onNavigate, excludedPrefix, excludedPrefixes }: FolderPickerProps) {
  const [state, setState] = useState<{ prefix: string; folders: FolderObject[] } | { prefix: string; error: string } | null>(
    null,
  );

  useEffect(() => {
    let cancelled = false;
    listObjects(prefix)
      .then((res) => !cancelled && setState({ prefix, folders: res.folders }))
      .catch((err) => !cancelled && setState({ prefix, error: errorMessage(err, 'Failed to load folders') }));
    return () => {
      cancelled = true;
    };
  }, [prefix]);

  const current = state && state.prefix === prefix ? state : null;
  const folders = current && 'folders' in current ? current.folders.filter((f) => f.prefix !== excludedPrefix && !excludedPrefixes?.includes(f.prefix)) : [];

  return (
    <div className="rounded-xl border border-line bg-surface">
      <div className="border-b border-line px-2 py-1.5">
        <Breadcrumbs currentPrefix={prefix} rootLabel="All files" onNavigate={onNavigate} />
      </div>
      <div className="h-48 overflow-y-auto p-1.5">
        {!current ? (
          <div role="status" aria-label="Loading folders" className="flex h-full items-center justify-center text-ink-3">
            <Spinner className="size-5" />
          </div>
        ) : 'error' in current ? (
          <p role="alert" className="p-3 text-sm text-danger">
            {current.error}
          </p>
        ) : folders.length === 0 ? (
          <p className="flex h-full items-center justify-center text-sm text-ink-3">No subfolders here</p>
        ) : (
          <ul>
            {folders.map((folder) => (
              <li key={folder.prefix}>
                <button
                  type="button"
                  onClick={() => onNavigate(folder.prefix)}
                  className="flex w-full items-center gap-2.5 rounded-lg px-2.5 py-2 text-left text-sm text-ink transition hover:bg-sunken"
                >
                  <FolderIcon size="sm" />
                  <span className="truncate">{folder.name}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
