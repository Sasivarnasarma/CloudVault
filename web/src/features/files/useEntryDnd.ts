import type { DragEvent, PointerEvent } from 'react';
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

  // Touch screens drag with a finger instead (see useTouchDrag), so the browser's drag stays off.
  const touchScreen = window.matchMedia?.('(pointer: coarse)').matches ?? false;
  const dragProps = {
    draggable: !busy && !touchScreen,
    onPointerDown: (e: PointerEvent) => {
      if (busy || e.pointerType !== 'touch' || !d.onTouchDragStart) return;
      d.onTouchDragStart(e, selection.has(entry.id) ? [...selection] : [entry.id]);
    },
    onDragStart: (e: DragEvent) => {
      // Dragging part of a multi-selection moves the whole selection; otherwise just this item.
      const ids = selection.has(entry.id) ? [...selection] : [entry.id];
      setEntryDrag(e, ids);
      d.onDragStart(ids);
    },
    onDragEnd: d.onDragEnd,
  };

  // A finger dragged over this folder finds it by this attribute.
  const dropAttrs = accepts && entry.type === 'folder' ? { 'data-drop-prefix': entry.folder.prefix } : {};

  return { dragging, busy, over: drop.over, dropHandlers: { ...drop.handlers, ...dropAttrs }, dragProps };
}
