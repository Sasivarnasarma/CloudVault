import { useCallback, useRef } from 'react';
import { toast } from 'sonner';
import type { DroppedContent } from '../../lib/dropEntries';
import { createFolder } from '../../services/folderService';
import { useFileDrop } from './useFileDrop';
import { useUpload } from './useUpload';

/**
 * Everything about adding files to the folder being viewed: the upload queue, files or folders
 * dropped on the window, and the two file pickers (their hidden inputs are in `UploadPickers`).
 */
export function useFolderUploads(currentPrefix: string, onRefresh: () => void) {
  const queue = useUpload();
  const { startUploads } = queue;
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const scanToast = useRef<{ timer: number; id?: string | number }>({ timer: 0 });

  const uploadContent = useCallback(
    async ({ sources, emptyFolders, skipped }: DroppedContent) => {
      if (sources.length === 0 && emptyFolders.length === 0) {
        if (skipped > 0) toast.info('Only system files were found, so nothing was uploaded.');
        return;
      }
      const base = currentPrefix ? currentPrefix.replace(/\/+$/, '') + '/' : '';
      const emptyDone = Promise.allSettled(emptyFolders.map((path) => createFolder(`${base}${path}`)));

      if (sources.length > 0) {
        await startUploads(sources, currentPrefix, async () => {
          await emptyDone;
          onRefresh();
        });
      } else {
        await emptyDone;
        onRefresh();
      }
    },
    [startUploads, currentPrefix, onRefresh],
  );

  const uploadFiles = useCallback(
    (files: File[]) => uploadContent({ sources: files.map((file) => ({ file })), emptyFolders: [], skipped: 0 }),
    [uploadContent],
  );

  const { dragging } = useFileDrop({
    onDrop: uploadContent,
    // Reading a big folder tree can take a while: only mention it if it does.
    onScanStart: () => {
      scanToast.current.timer = window.setTimeout(() => {
        scanToast.current.id = toast.loading('Reading folders…');
      }, 400);
    },
    onScanEnd: () => {
      window.clearTimeout(scanToast.current.timer);
      if (scanToast.current.id !== undefined) toast.dismiss(scanToast.current.id);
      scanToast.current.id = undefined;
    },
    onError: () => toast.error('Couldn’t read the dropped items.'),
  });

  return {
    /** Something is being dragged over the window to be uploaded. */
    dragging,
    uploadContent,
    uploadFiles,
    fileInputRef,
    folderInputRef,
    openFilePicker: () => fileInputRef.current?.click(),
    openFolderPicker: () => folderInputRef.current?.click(),
    /** Props for the upload tray. */
    tray: {
      queue: queue.queue,
      isUploading: queue.isUploading,
      onClear: queue.clearQueue,
      onReplace: (item: Parameters<typeof queue.replaceItem>[0]) => queue.replaceItem(item, onRefresh),
      onSkip: queue.dismissItem,
      onCancel: queue.cancelItem,
      onRetry: (item: Parameters<typeof queue.retryItem>[0]) => queue.retryItem(item, onRefresh),
      onReplaceAll: () => queue.replaceConflicts(onRefresh),
      onSkipAll: queue.skipConflicts,
    },
  };
}
