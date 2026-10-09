import { useCallback, useState } from 'react';
import { errorMessage } from '../../lib/cn';
import { ApiError } from '../../services/http';
import { requestPresignedUpload } from '../../services/objectService';
import { uploadFileDirect } from '../../services/transferService';

export interface UploadItem {
  id: string;
  file: File;
  /** Destination object key. */
  key: string;
  progress: number;
  /** `conflict` means the key already exists and the user can choose to replace it. */
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'conflict';
  errorMsg?: string;
}

export function useUpload() {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const patchItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const uploadItem = useCallback(
    async (item: UploadItem, overwrite: boolean) => {
      patchItem(item.id, { status: 'uploading', progress: 0, errorMsg: undefined });
      const contentType = item.file.type || 'application/octet-stream';

      try {
        const presign = await requestPresignedUpload(item.key, contentType, item.file.size, overwrite);
        await uploadFileDirect(presign.upload_url, item.file, contentType, (percent) =>
          patchItem(item.id, { progress: percent }),
        );
        patchItem(item.id, { progress: 100, status: 'completed' });
      } catch (err) {
        const exists = err instanceof ApiError && err.status === 409;
        patchItem(item.id, {
          status: exists ? 'conflict' : 'error',
          errorMsg: errorMessage(err, 'Upload failed'),
        });
      }
    },
    [patchItem],
  );

  const startUploads = async (files: File[], targetPrefix: string, onAllComplete?: () => void) => {
    if (files.length === 0) return;

    const cleanPrefix = targetPrefix ? targetPrefix.replace(/\/+$/, '') + '/' : '';
    const items: UploadItem[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      key: `${cleanPrefix}${file.name}`,
      progress: 0,
      status: 'pending',
    }));

    setQueue(items);
    setIsUploading(true);
    for (const item of items) {
      await uploadItem(item, false);
    }
    setIsUploading(false);
    onAllComplete?.();
  };

  /** Re-upload a file that hit a name conflict, replacing the existing object. */
  const replaceItem = async (item: UploadItem, onComplete?: () => void) => {
    setIsUploading(true);
    await uploadItem(item, true);
    setIsUploading(false);
    onComplete?.();
  };

  /** Drop a single entry (e.g. skip a conflicting file) from the queue. */
  const dismissItem = (id: string) => {
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return {
    queue,
    isUploading,
    startUploads,
    replaceItem,
    dismissItem,
    clearQueue,
  };
}
