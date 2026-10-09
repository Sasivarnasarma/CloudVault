import { useCallback, useEffect, useRef, useState } from 'react';
import { delay, runPool, Semaphore } from '../../lib/concurrency';
import { errorMessage } from '../../lib/cn';
import { ApiError } from '../../services/http';
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  presignUploadParts,
} from '../../services/multipartService';
import { requestPresignedUpload } from '../../services/objectService';
import { isAbortError, TransferError, uploadFileDirect, uploadPartDirect } from '../../services/transferService';

const MIB = 1024 * 1024;
/** Files larger than this are uploaded in parts. */
export const MULTIPART_THRESHOLD = 64 * MIB;
const FILE_CONCURRENCY = 3;
const PART_CONCURRENCY = 4;
const PART_ATTEMPTS = 4;

export interface UploadItem {
  id: string;
  file: File;
  /** Destination object key. */
  key: string;
  progress: number;
  /**
   * `conflict`: the key already exists and the user can choose to replace it.
   * `cancelled` / `error`: can be retried; a failed multipart upload resumes where it stopped.
   */
  status: 'pending' | 'uploading' | 'completed' | 'error' | 'conflict' | 'cancelled';
  errorMsg?: string;
}

/** A file to upload, optionally with a path (including the file name) relative to the target folder. */
export interface UploadSource {
  file: File;
  path?: string;
}

interface MultipartSession {
  uploadId: string;
  partSize: number;
  partCount: number;
}

class NameConflictError extends Error {}

const isActive = (item: UploadItem) => item.status === 'uploading' || item.status === 'pending';

async function asConflict<T>(work: Promise<T>): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (err instanceof ApiError && err.status === 409) throw new NameConflictError(err.message);
    throw err;
  }
}

export function useUpload() {
  const [queue, setQueue] = useState<UploadItem[]>([]);
  const queueRef = useRef<UploadItem[]>([]);
  const controllers = useRef(new Map<string, AbortController>());
  const sessions = useRef(new Map<string, MultipartSession>());
  const cancelled = useRef(new Set<string>());
  const fileSlots = useRef(new Semaphore(FILE_CONCURRENCY));
  const nextId = useRef(0);

  const isUploading = queue.some(isActive);

  useEffect(() => {
    queueRef.current = queue;
  }, [queue]);

  // Warn before closing the tab while files are still being sent.
  useEffect(() => {
    if (!isUploading) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [isUploading]);

  const patchItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const uploadSingle = async (item: UploadItem, overwrite: boolean, signal: AbortSignal) => {
    const contentType = item.file.type || 'application/octet-stream';
    const presign = await asConflict(requestPresignedUpload(item.key, contentType, item.file.size, overwrite));
    await uploadFileDirect(presign.upload_url, item.file, contentType, (percent) => patchItem(item.id, { progress: percent }), signal);
  };

  const uploadMultipart = async (item: UploadItem, overwrite: boolean, signal: AbortSignal) => {
    const { file, key } = item;
    let session = sessions.current.get(item.id);
    const done = new Set<number>();

    if (!session) {
      const plan = await asConflict(
        createMultipartUpload(key, file.size, file.type || 'application/octet-stream', overwrite),
      );
      session = { uploadId: plan.upload_id, partSize: plan.part_size, partCount: plan.part_count };
      if (signal.aborted) {
        // Cancelled while the upload was being created: don't leave an orphan behind.
        abortMultipartUpload(key, session.uploadId).catch(() => undefined);
        throw new DOMException('Upload cancelled', 'AbortError');
      }
      sessions.current.set(item.id, session);
    } else {
      // Resuming: ask storage which parts it already has.
      const stored = await listUploadedParts(key, session.uploadId);
      stored.parts.forEach((p) => done.add(p.part_number));
    }

    const { uploadId, partSize, partCount } = session;
    const partBytes = (n: number) => Math.min(n * partSize, file.size) - (n - 1) * partSize;
    const loaded = new Map<number, number>();
    done.forEach((n) => loaded.set(n, partBytes(n)));

    let lastPercent = -1;
    const report = () => {
      let sent = 0;
      loaded.forEach((bytes) => (sent += bytes));
      const percent = Math.min(99, Math.floor((sent / file.size) * 100));
      if (percent !== lastPercent) {
        lastPercent = percent;
        patchItem(item.id, { progress: percent });
      }
    };
    report();

    const sendPart = async (n: number) => {
      const blob = file.slice((n - 1) * partSize, Math.min(n * partSize, file.size));
      for (let attempt = 1; ; attempt++) {
        try {
          // A fresh URL per attempt also covers URLs that expired during a long upload.
          const { parts } = await presignUploadParts(key, uploadId, [n]);
          await uploadPartDirect(
            parts[0].url,
            blob,
            (sent) => {
              loaded.set(n, sent);
              report();
            },
            signal,
          );
          loaded.set(n, blob.size);
          report();
          return;
        } catch (err) {
          const retryable = err instanceof TransferError ? err.retryable : err instanceof ApiError && err.status >= 500;
          if (signal.aborted || !retryable || attempt >= PART_ATTEMPTS) throw err;
          loaded.set(n, 0);
          await delay(500 * 2 ** (attempt - 1), signal);
        }
      }
    };

    const missing = Array.from({ length: partCount }, (_, i) => i + 1).filter((n) => !done.has(n));
    await runPool(missing, PART_CONCURRENCY, sendPart);

    await completeMultipartUpload(key, uploadId, partCount);
    sessions.current.delete(item.id);
  };

  const run = useCallback(
    async (item: UploadItem, overwrite: boolean) => {
      const release = await fileSlots.current.acquire();
      try {
        if (cancelled.current.has(item.id)) return; // cancelled while waiting for a slot
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        patchItem(item.id, { status: 'uploading', errorMsg: undefined, ...(sessions.current.has(item.id) ? {} : { progress: 0 }) });

        try {
          if (item.file.size > MULTIPART_THRESHOLD) await uploadMultipart(item, overwrite, controller.signal);
          else await uploadSingle(item, overwrite, controller.signal);
          patchItem(item.id, { progress: 100, status: 'completed' });
        } catch (err) {
          if (controller.signal.aborted || isAbortError(err)) {
            patchItem(item.id, { status: 'cancelled', errorMsg: 'Upload cancelled' });
          } else if (err instanceof NameConflictError) {
            patchItem(item.id, { status: 'conflict', errorMsg: err.message });
          } else {
            patchItem(item.id, { status: 'error', errorMsg: errorMessage(err, 'Upload failed') });
          }
        } finally {
          controllers.current.delete(item.id);
        }
      } finally {
        release();
      }
    },
    [patchItem],
  );

  /** Free the storage held by a half-finished multipart upload. */
  const discard = useCallback((item: UploadItem) => {
    cancelled.current.add(item.id);
    controllers.current.get(item.id)?.abort();
    const session = sessions.current.get(item.id);
    if (session) {
      sessions.current.delete(item.id);
      abortMultipartUpload(item.key, session.uploadId).catch(() => undefined);
    }
  }, []);

  const startUploads = async (sources: Array<File | UploadSource>, targetPrefix: string, onAllComplete?: () => void) => {
    if (sources.length === 0) return;

    const cleanPrefix = targetPrefix ? targetPrefix.replace(/\/+$/, '') + '/' : '';
    const items: UploadItem[] = sources.map((source) => {
      const { file, path } = source instanceof File ? { file: source, path: undefined } : source;
      return {
        id: `upload-${Date.now()}-${nextId.current++}`,
        file,
        key: `${cleanPrefix}${path ?? file.name}`,
        progress: 0,
        status: 'pending',
      };
    });

    // A new batch starts a fresh list unless uploads are still running, in which case it joins them.
    setQueue((prev) => (prev.some(isActive) ? [...prev, ...items] : items));
    await Promise.all(items.map((item) => run(item, false)));
    onAllComplete?.();
  };

  /** Re-upload a file that hit a name conflict, replacing the existing object. */
  const replaceItem = async (item: UploadItem, onComplete?: () => void) => {
    await run(item, true);
    onComplete?.();
  };

  /** Try a failed or cancelled upload again; multipart uploads resume with the parts already stored. */
  const retryItem = async (item: UploadItem, onComplete?: () => void) => {
    cancelled.current.delete(item.id);
    patchItem(item.id, { status: 'pending', errorMsg: undefined });
    await run(item, false);
    onComplete?.();
  };

  /** Stop an upload (or keep it from starting) and discard anything already stored for it. */
  const cancelItem = (id: string) => {
    const item = queueRef.current.find((q) => q.id === id);
    if (!item || !isActive(item)) return;
    discard(item);
    patchItem(id, { status: 'cancelled', errorMsg: 'Upload cancelled' });
  };

  /** Drop a single entry (e.g. skip a conflicting file) from the queue. */
  const dismissItem = (id: string) => {
    const item = queueRef.current.find((q) => q.id === id);
    if (item) discard(item);
    setQueue((prev) => prev.filter((q) => q.id !== id));
  };

  const clearQueue = () => {
    queueRef.current.forEach(discard);
    setQueue([]);
  };

  return {
    queue,
    isUploading,
    startUploads,
    replaceItem,
    retryItem,
    cancelItem,
    dismissItem,
    clearQueue,
  };
}
