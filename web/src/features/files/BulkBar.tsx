import { Archive, Copy, FolderInput, Trash2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, IconButton } from '../../components/common/Button';
import type { Entry } from '../../lib/entries';
import { describeEntries } from './bulkActions';

interface BulkBarProps {
  entries: Entry[];
  busy?: boolean;
  onMove: () => void;
  onCopy: () => void;
  onDownloadZip: () => void;
  onDelete: () => void;
  onClear: () => void;
}

/** Floating action bar shown while several items (or any folder) are selected. */
export function BulkBar({ entries, busy, onMove, onCopy, onDownloadZip, onDelete, onClear }: BulkBarProps) {
  return (
    <AnimatePresence>
      {entries.length > 0 && (
        <motion.div
          role="toolbar"
          aria-label="Actions for selected items"
          initial={{ opacity: 0, y: 16, scale: 0.98 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.98 }}
          transition={{ type: 'spring', stiffness: 420, damping: 34 }}
          className="absolute bottom-4 left-1/2 z-20 flex max-w-[calc(100%-2rem)] -translate-x-1/2 items-center gap-1 rounded-2xl border border-line bg-surface-2 p-1.5 pl-4 shadow-pop"
        >
          <span className="mr-2 whitespace-nowrap text-sm font-medium text-ink" aria-live="polite">
            {entries.length} selected
            <span className="ml-1.5 hidden text-ink-3 sm:inline">({describeEntries(entries)})</span>
          </span>
          <Button variant="ghost" onClick={onMove} disabled={busy}>
            <FolderInput className="size-4" />
            <span className="max-sm:sr-only">Move to…</span>
          </Button>
          <Button variant="ghost" onClick={onCopy} disabled={busy}>
            <Copy className="size-4" />
            <span className="max-sm:sr-only">Copy to…</span>
          </Button>
          <Button variant="ghost" onClick={onDownloadZip} disabled={busy}>
            <Archive className="size-4" />
            <span className="max-sm:sr-only">Download as zip</span>
          </Button>
          <Button
            variant="ghost"
            className="text-danger hover:bg-danger-soft hover:text-danger"
            onClick={onDelete}
            disabled={busy}
          >
            <Trash2 className="size-4" />
            <span className="max-sm:sr-only">Delete</span>
          </Button>
          <IconButton label="Clear selection" onClick={onClear}>
            <X className="size-4" />
          </IconButton>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
