import type { DragEvent } from 'react';

/** Custom drag type for entries dragged inside the page (file drags from the desktop use "Files"). */
export const ENTRY_DRAG_TYPE = 'application/x-cloudvault-entries';

/** Start dragging these entries. Browsers only begin a drag once some data is set. */
export function setEntryDrag(e: DragEvent, ids: string[]): void {
  e.dataTransfer.setData(ENTRY_DRAG_TYPE, JSON.stringify(ids));
  e.dataTransfer.setData('text/plain', ids.join('\n'));
  e.dataTransfer.effectAllowed = 'move';
}

/** True while the thing being dragged over an element is one of our entries (not a desktop file). */
export function isEntryDrag(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes(ENTRY_DRAG_TYPE);
}
