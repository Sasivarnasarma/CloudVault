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

  /** Is this entry directly inside the folder `destination`? */
  const isIn = (entry: Entry, destination: string) => parentPrefix(entryPath(entry)) === destination;

  /**
   * Remember items (by default the selection). Returns false when there is nothing to copy, or when
   * the user is copying text they selected on the page.
   */
  const put = (mode: 'copy' | 'cut', items: Entry[] = selected): false | void => {
    if (items.length === 0 || window.getSelection()?.toString()) return false;
    setClipboard({ mode, entries: items });
  };

  /** False when pasting into this folder would do nothing: cut items that are already in it. */
  const canPasteInto = (destination: string) =>
    clipboard !== null && (clipboard.mode !== 'cut' || clipboard.entries.some((e) => !isIn(e, destination)));

  /** Paste into a folder: the one being viewed unless another is given. */
  const paste = async (destination: string = currentPrefix) => {
    if (!clipboard || transfers.transferring) return;
    const { mode, entries: source } = clipboard;
    const isHere = (entry: Entry) => isIn(entry, destination);

    // Moving something to the folder it is already in does nothing.
    const items = mode === 'cut' ? source.filter((e) => !isHere(e)) : source;
    if (items.length === 0) {
      setClipboard(null);
      return;
    }

    // A copy pasted next to its original gets a new name instead of failing.
    const taken = new Set(destination === currentPrefix ? entries.map((e) => e.name) : []);
    const names = new Map<string, string>();
    if (mode === 'copy') {
      for (const entry of items.filter(isHere)) {
        const name = copyName(entry.name, taken, entry.type === 'folder');
        taken.add(name);
        names.set(entry.id, name);
      }
    }

    const results = await transfers.run(items, mode === 'cut' ? 'move' : 'copy', destination, (e) => names.get(e.id));
    if (results) {
      const failed = summarize(results).failed.map((r) => r.entry);
      setClipboard(failed.length > 0 ? { mode, entries: failed } : null);
    }
  };

  return {
    clipboard,
    /** Ids of the items waiting to be moved, to show them faded. */
    cutIds: clipboard?.mode === 'cut' ? clipboard.entries.map((e) => e.id) : undefined,
    /** False when pasting into the folder being viewed would do nothing. */
    canPaste: clipboard?.mode !== 'cut' || canPasteInto(currentPrefix),
    canPasteInto,
    copy: (items?: Entry[]) => put('copy', items),
    cut: (items?: Entry[]) => put('cut', items),
    paste,
    clear: () => setClipboard(null),
  };
}
