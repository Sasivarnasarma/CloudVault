import { ConfirmDialog } from '../../components/common/ConfirmDialog';
import type { Entry } from '../../lib/entries';
import { describeEntries } from './bulkActions';

interface DeleteDialogProps {
  /** The items to delete, or null while the dialog is closed. */
  entries: Entry[] | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** Asks before deleting one item or several. */
export function DeleteDialog({ entries, loading, onConfirm, onCancel }: DeleteDialogProps) {
  const items = entries ?? [];
  const [only] = items.length === 1 ? items : [];
  const hasFolder = items.some((e) => e.type === 'folder');

  let title = `Delete ${items.length} items?`;
  let description = `${describeEntries(items)} will be permanently deleted${
    hasFolder ? ', including everything inside the folders' : ''
  }. This can’t be undone.`;
  if (only?.type === 'folder') {
    title = 'Delete folder?';
    description = `“${only.name}” and everything inside it will be permanently deleted.`;
  } else if (only) {
    title = 'Delete file?';
    description = `“${only.name}” will be permanently deleted. This can’t be undone.`;
  }

  return (
    <ConfirmDialog
      open={entries !== null}
      loading={loading}
      title={title}
      description={description}
      confirmLabel="Delete"
      onConfirm={onConfirm}
      onCancel={onCancel}
    />
  );
}
