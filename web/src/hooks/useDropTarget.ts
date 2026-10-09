import { useRef, useState, type DragEvent } from 'react';
import { isEntryDrag } from '../lib/dragMove';

interface DropTargetOptions {
  /** Whether this element accepts the entries currently being dragged. */
  enabled: boolean;
  onDrop: () => void;
}

/**
 * Turns an element into a drop target for entries dragged inside the page.
 * Returns the props to spread on it and `over`, true while a dragged entry hovers it.
 */
export function useDropTarget({ enabled, onDrop }: DropTargetOptions) {
  const [over, setOver] = useState(false);
  // dragenter/dragleave also fire for child elements, so count them to avoid flicker.
  const depth = useRef(0);

  const handlers = enabled
    ? {
        onDragEnter: (e: DragEvent) => {
          if (!isEntryDrag(e)) return;
          depth.current += 1;
          setOver(true);
        },
        onDragOver: (e: DragEvent) => {
          if (!isEntryDrag(e)) return;
          e.preventDefault(); // required for the element to accept a drop
          e.dataTransfer.dropEffect = 'move';
        },
        onDragLeave: (e: DragEvent) => {
          if (!isEntryDrag(e)) return;
          depth.current = Math.max(0, depth.current - 1);
          if (depth.current === 0) setOver(false);
        },
        onDrop: (e: DragEvent) => {
          if (!isEntryDrag(e)) return;
          e.preventDefault();
          e.stopPropagation();
          depth.current = 0;
          setOver(false);
          onDrop();
        },
      }
    : {};

  return { over: enabled && over, handlers };
}
