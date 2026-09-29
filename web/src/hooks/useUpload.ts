import { useState } from 'react';
import { requestPresignedUpload, uploadFileDirect } from '../services/uploadService';

export interface UploadItem {
  id: string;
  file: File;
  progress: number;
  status: 'pending' | 'uploading' | 'completed' | 'error';
  errorMsg?: string;
}

export function useUpload() {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const [isUploading, setIsUploading] = useState<boolean>(false);

  const startUploads = async (
    files: File[],
    targetPrefix: string,
    onAllComplete?: () => void
  ) => {
    if (files.length === 0) return;

    const initialQueue: UploadItem[] = files.map((file, idx) => ({
      id: `${Date.now()}-${idx}-${file.name}`,
      file,
      progress: 0,
      status: 'pending',
    }));

    setQueue(initialQueue);
    setIsUploading(true);

    const cleanPrefix = targetPrefix ? targetPrefix.replace(/\/+$/, '') + '/' : '';

    for (const item of initialQueue) {
      setQueue((prev) =>
        prev.map((q) => (q.id === item.id ? { ...q, status: 'uploading' } : q))
      );

      const objectKey = `${cleanPrefix}${item.file.name}`;
      const contentType = item.file.type || 'application/octet-stream';

      try {
        const presignRes = await requestPresignedUpload(
          objectKey,
          contentType,
          item.file.size
        );

        await uploadFileDirect(
          presignRes.upload_url,
          item.file,
          contentType,
          (percent) => {
            setQueue((prev) =>
              prev.map((q) => (q.id === item.id ? { ...q, progress: percent } : q))
            );
          }
        );

        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id ? { ...q, progress: 100, status: 'completed' } : q
          )
        );
      } catch (err: any) {
        setQueue((prev) =>
          prev.map((q) =>
            q.id === item.id
              ? { ...q, status: 'error', errorMsg: err.message || 'Upload failed' }
              : q
          )
        );
      }
    }

    setIsUploading(false);
    if (onAllComplete) {
      onAllComplete();
    }
  };

  const clearQueue = () => {
    setQueue([]);
  };

  return {
    queue,
    isUploading,
    startUploads,
    clearQueue,
  };
}
