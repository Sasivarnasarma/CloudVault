import { FolderOpen, SearchX } from 'lucide-react';
import { StateMessage } from '../../components/common/StateMessage';

interface EmptyFolderStateProps {
  filtered: boolean;
  onClearFilters: () => void;
}

export function EmptyFolderState({ filtered, onClearFilters }: EmptyFolderStateProps) {
  return (
    <StateMessage
      icon={filtered ? SearchX : FolderOpen}
      title={filtered ? 'Nothing matches your filters' : 'This folder is empty'}
      description={
        filtered
          ? 'Try a different search term or clear the filters.'
          : 'Drag files anywhere on this window to upload them, or create a new folder.'
      }
    >
      {filtered && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-lg px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent-soft"
        >
          Clear filters
        </button>
      )}
    </StateMessage>
  );
}
