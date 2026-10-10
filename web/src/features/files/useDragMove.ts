import { useState } from 'react';
import type { Entry } from '../../lib/entries';
import type { Transfers } from './useTransfers';

/** Dragging entries onto a folder (a tile, the path above the list or the up button) moves them there. */
export function useDragMove({
  entries,
  currentPrefix,
  run,
}: {
  /** Everything in the folder, so a drag can find the entries it carries by id. */
  entries: Entry[];
  currentPrefix: string;
  run: Transfers['run'];
}) {
  const [dragIds, setDragIds] = useState<string[] | null>(null);

  const dropOn = async (destinationPrefix: string) => {
    const ids = dragIds ?? [];
    setDragIds(null);
    const moving = entries.filter((e) => ids.includes(e.id));
    if (moving.length === 0 || destinationPrefix === currentPrefix) return;
    await run(moving, 'move', destinationPrefix);
  };

  return { dragIds, startDrag: setDragIds, endDrag: () => setDragIds(null), dropOn };
}
