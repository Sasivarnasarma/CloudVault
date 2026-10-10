import { useState } from 'react';
import type { Entry } from '../../lib/entries';
import { copyName, entryPath, parentPrefix } from '../../lib/paths';
import { summarize } from './bulkActions';
import type { Transfers } from './useTransfers';

interface Options {
  /** The entries selected right now: what Copy and Cut put on the clipboard. */
  selected: Entry[];
  /** Everything in the folder being viewed (to name a copy so it doesn't clash). */
  entries: Entry[];
  currentPrefix: string;
  transfers: Pick<Transfers, 'run' | 'transferring'>;
}

/**
 * Copy / cut / paste for entries: Copy and Cut remember the selected items, Paste copies or moves
 * them into the folder being viewed and then empties the clipboard (only items that failed stay).
 */
export function useClipboard({ selected, entries, currentPrefix, transfers }: Options) {
  const [clipboard, setClipboard] = useState<{ mode: 'copy' | 'cut'; entries: Entry[] } | null>(null);

  const isHere = (entry: Entry) => parentPrefix(entryPath(entry)) === currentPrefix;

  /** Remember the selection. Returns false when there is nothing to copy (or the user is copying selected text). */
  const put = (mode: 'copy' | 'cut'): false | void => {
    if (selected.length === 0 || window.getSelection()?.toString()) return false;
    setClipboard({ mode, entries: selected });
  };

  const paste = async () => {
    if (!clipboard || transfers.transferring) return;
    const { mode, entries: source } = clipboard;

    // Moving something to the folder it is already in does nothing.
    const items = mode === 'cut' ? source.filter((e) => !isHere(e)) : source;
    if (items.length === 0) {
      setClipboard(null);
      return;
    }

    // A copy pasted next to its original gets a new name instead of failing.
    const taken = new Set(entries.map((e) => e.name));
    const names = new Map<string, string>();
    if (mode === 'copy') {
      for (const entry of items.filter(isHere)) {
        const name = copyName(entry.name, taken, entry.type === 'folder');
        taken.add(name);
        names.set(entry.id, name);
      }
    }

    const results = await transfers.run(items, mode === 'cut' ? 'move' : 'copy', currentPrefix, (e) => names.get(e.id));
    if (results) {
      const failed = summarize(results).failed.map((r) => r.entry);
      setClipboard(failed.length > 0 ? { mode, entries: failed } : null);
    }
  };

  return {
    clipboard,
    /** Ids of the items waiting to be moved, to show them faded. */
    cutIds: clipboard?.mode === 'cut' ? clipboard.entries.map((e) => e.id) : undefined,
    /** False when pasting would do nothing: cut items that are already in this folder. */
    canPaste: clipboard?.mode !== 'cut' || clipboard.entries.some((e) => !isHere(e)),
    copy: () => put('copy'),
    cut: () => put('cut'),
    paste,
    clear: () => setClipboard(null),
  };
}
