import { useState, type PointerEvent } from 'react';
import type { Entry } from '../../lib/entries';
import type { Transfers } from './useTransfers';
import { useTouchDrag } from './useTouchDrag';

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

  const touch = useTouchDrag({
    onStart: setDragIds,
    onDrop: (prefix) => void dropOn(prefix),
    onCancel: () => setDragIds(null),
  });

  /** Start dragging with a finger: the items move once the finger is lifted over a folder. */
  const startTouchDrag = (event: PointerEvent, ids: string[]) => {
    const names = entries.filter((e) => ids.includes(e.id)).map((e) => e.name);
    touch.begin(event, ids, names.length === 1 ? names[0] : `${names.length} items`);
  };

  return { dragIds, startDrag: setDragIds, endDrag: () => setDragIds(null), startTouchDrag, dropOn };
}
