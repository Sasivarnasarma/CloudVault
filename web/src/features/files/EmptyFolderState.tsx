import { FolderOpen, SearchX } from 'lucide-react';

interface EmptyFolderStateProps {
  filtered: boolean;
  onClearFilters: () => void;
}

export function EmptyFolderState({ filtered, onClearFilters }: EmptyFolderStateProps) {
  const Icon = filtered ? SearchX : FolderOpen;
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
      <div className="mb-5 flex size-20 items-center justify-center rounded-3xl border border-dashed border-line-strong bg-surface text-ink-3">
        <Icon className="size-9" strokeWidth={1.5} />
      </div>
      <h2 className="text-base font-semibold text-ink">
        {filtered ? 'Nothing matches your filters' : 'This folder is empty'}
      </h2>
      <p className="mt-1.5 max-w-xs text-sm text-ink-3">
        {filtered
          ? 'Try a different search term or clear the filters.'
          : 'Drag files anywhere on this window to upload them, or create a new folder.'}
      </p>
      {filtered && (
        <button
          type="button"
          onClick={onClearFilters}
          className="mt-4 rounded-lg px-3 py-1.5 text-sm font-medium text-accent transition hover:bg-accent-soft"
        >
          Clear filters
        </button>
      )}
    </div>
  );
}
