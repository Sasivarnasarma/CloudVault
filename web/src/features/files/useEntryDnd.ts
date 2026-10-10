import type { DragEvent } from 'react';
import { useDropTarget } from '../../hooks/useDropTarget';
import { setEntryDrag } from '../../lib/dragMove';
import type { Entry } from '../../lib/entries';
import type { DragHandlers } from './browserTypes';

/** Drag source and (for folders) drop target behaviour of one entry. */
export function useEntryDnd(entry: Entry, selection: ReadonlySet<string>, d: DragHandlers) {
  const dragging = d.dragIds?.includes(entry.id) ?? false;
  const busy = d.busyIds?.includes(entry.id) ?? false;
  // A folder accepts drops of anything except itself.
  const accepts = entry.type === 'folder' && d.dragIds !== null && !dragging;
  const drop = useDropTarget({
    enabled: accepts,
    onDrop: () => entry.type === 'folder' && d.onDropOnFolder(entry.folder.prefix),
  });

  const dragProps = {
    draggable: !busy,
    onDragStart: (e: DragEvent) => {
      // Dragging part of a multi-selection moves the whole selection; otherwise just this item.
      const ids = selection.has(entry.id) ? [...selection] : [entry.id];
      setEntryDrag(e, ids);
      d.onDragStart(ids);
    },
    onDragEnd: d.onDragEnd,
  };

  return { dragging, busy, over: drop.over, dropHandlers: drop.handlers, dragProps };
}
