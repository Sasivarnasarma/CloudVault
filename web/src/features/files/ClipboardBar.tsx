import { ClipboardPaste, Copy, Loader2, Scissors, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { Button, IconButton } from '../../components/common/Button';
import type { Entry } from '../../lib/entries';
import { chordKeys } from '../../lib/keymap';
import { describeEntries } from './bulkActions';

interface ClipboardBarProps {
  /** What Ctrl+C / Ctrl+X put on the clipboard, or null when it is empty. */
  clipboard: { mode: 'copy' | 'cut'; entries: Entry[] } | null;
  /** Name of the folder being viewed, where "Paste here" puts the items. */
  destination: string;
  /** False when pasting would do nothing, e.g. cut items that are already in this folder. */
  canPaste: boolean;
  busy?: boolean;
  onPaste: () => void;
  onClear: () => void;
}

/** Strip under the toolbar that shows what was copied or cut, with a Paste button. */
export function ClipboardBar({ clipboard, destination, canPaste, busy, onPaste, onClear }: ClipboardBarProps) {
  const Icon = clipboard?.mode === 'cut' ? Scissors : Copy;

  return (
    <AnimatePresence initial={false}>
      {clipboard && (
        <motion.div
          role="region"
          aria-label="Clipboard"
          initial={{ height: 0, opacity: 0 }}
          animate={{ height: 'auto', opacity: 1 }}
          exit={{ height: 0, opacity: 0 }}
          transition={{ duration: 0.18, ease: 'easeOut' }}
          className="overflow-hidden border-b border-line bg-accent-soft"
        >
          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 px-4 py-2 sm:px-5">
            <span className="flex min-w-0 items-center gap-2 text-sm text-ink" aria-live="polite">
              <Icon className="size-4 shrink-0 text-accent" />
              <span className="truncate font-medium">
                {describeEntries(clipboard.entries)} {clipboard.mode === 'cut' ? 'ready to move' : 'copied'}
              </span>
            </span>
            <span className="ml-auto flex items-center gap-1.5">
              {!canPaste && <span className="text-xs text-ink-3">Already in this folder</span>}
              <Button variant="primary" onClick={onPaste} disabled={!canPaste || busy} className="h-8">
                {busy ? <Loader2 className="size-4 animate-spin" /> : <ClipboardPaste className="size-4" />}
                <span>
                  Paste into <span className="font-semibold">{destination}</span>
                </span>
                <kbd className="hidden rounded border border-white/30 px-1 font-mono text-[11px] sm:inline">
                  {chordKeys('mod+v').join('+')}
                </kbd>
              </Button>
              <IconButton label="Clear clipboard" onClick={onClear} className="size-8">
                <X className="size-4" />
              </IconButton>
            </span>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
