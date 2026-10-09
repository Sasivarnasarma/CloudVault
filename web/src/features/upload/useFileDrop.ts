import { useEffect, useRef, useState } from 'react';
import { readDroppedItems, type DroppedContent } from '../../lib/dropEntries';

const carriesFiles = (e: DragEvent) => Array.from(e.dataTransfer?.types ?? []).includes('Files');

interface UseFileDropOptions {
  /** Called with the files and folders that were dropped on the window. */
  onDrop: (content: DroppedContent) => void;
  /** Called while folder contents are being read, which can take a moment for large trees. */
  onScanStart?: () => void;
  onScanEnd?: () => void;
  onError?: (error: unknown) => void;
}

/**
 * Window-wide drag & drop for files and folders. Returns `dragging`, true while a file
 * is being dragged over the page, so the UI can show a drop overlay. Dragging items
 * around inside the page (moving entries) is ignored.
 */
export function useFileDrop({ onDrop, onScanStart, onScanEnd, onError }: UseFileDropOptions): { dragging: boolean } {
  const [dragging, setDragging] = useState(false);
  const depth = useRef(0);
  const latest = useRef({ onDrop, onScanStart, onScanEnd, onError });

  useEffect(() => {
    latest.current = { onDrop, onScanStart, onScanEnd, onError };
  });

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      depth.current = Math.max(0, depth.current - 1);
      if (depth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (carriesFiles(e)) e.preventDefault();
    };
    const onDropEvent = (e: DragEvent) => {
      if (!carriesFiles(e)) return;
      e.preventDefault();
      depth.current = 0;
      setDragging(false);

      // Entries must be captured synchronously; the browser clears them after the event.
      const pending = readDroppedItems(e.dataTransfer?.items);
      latest.current.onScanStart?.();
      pending
        .then((content) => latest.current.onDrop(content))
        .catch((error) => latest.current.onError?.(error))
        .finally(() => latest.current.onScanEnd?.());
    };

    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDropEvent);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDropEvent);
    };
  }, []);

  return { dragging };
}
