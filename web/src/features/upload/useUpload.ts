import { useCallback, useEffect, useRef, useState } from 'react';
import { delay, runPool, Semaphore } from '../../lib/concurrency';
import { errorMessage } from '../../lib/cn';
import {
  forgetPendingUpload,
  isSameFile,
  loadPendingUploads,
  rememberPendingUpload,
  type PendingUpload,
} from '../../lib/pendingUploads';
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
  /** The multipart upload this file is being sent as, once one has been started. */
  uploadId?: string;
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
  // Large uploads that were started and never finished, kept so they survive a refresh.
  const [stored] = useState(loadPendingUploads);
  const [pending, setPending] = useState<PendingUpload[]>(stored.pending);

  const isUploading = queue.some(isActive);
  // Left over from before a refresh: not part of this session's queue.
  const unfinished = pending.filter((p) => !queue.some((q) => q.uploadId === p.uploadId));

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

  // Parts of uploads that were left for too long only cost storage: free them.
  useEffect(() => {
    stored.expired.forEach((p) => abortMultipartUpload(p.key, p.uploadId).catch(() => undefined));
  }, [stored]);

  const forget = useCallback((uploadId: string) => {
    forgetPendingUpload(uploadId);
    setPending((prev) => prev.filter((p) => p.uploadId !== uploadId));
  }, []);

  const patchItem = useCallback((id: string, patch: Partial<UploadItem>) => {
    setQueue((prev) => prev.map((q) => (q.id === id ? { ...q, ...patch } : q)));
  }, []);

  const uploadSingle = async (item: UploadItem, overwrite: boolean, signal: AbortSignal) => {
    const contentType = item.file.type || 'application/octet-stream';
    const presign = await asConflict(requestPresignedUpload(item.key, contentType, item.file.size, overwrite));
    await uploadFileDirect(
      presign.upload_url,
      item.file,
      contentType,
      (percent) => patchItem(item.id, { progress: percent }),
      signal,
    );
  };

  const uploadMultipart = async (item: UploadItem, overwrite: boolean, signal: AbortSignal) => {
    const { file, key } = item;
    let session = sessions.current.get(item.id);
    const done = new Set<number>();

    if (session) {
      // Resuming: ask storage which parts it already has.
      try {
        const stored = await listUploadedParts(key, session.uploadId);
        stored.parts.forEach((p) => done.add(p.part_number));
      } catch (err) {
        if (!(err instanceof ApiError && err.status === 404)) throw err;
        // Storage no longer has the upload (finished, cancelled or expired): start it over.
        sessions.current.delete(item.id);
        forget(session.uploadId);
        session = undefined;
      }
    }

    if (!session) {
      const contentType = file.type || 'application/octet-stream';
      const plan = await asConflict(createMultipartUpload(key, file.size, contentType, overwrite));
      session = { uploadId: plan.upload_id, partSize: plan.part_size, partCount: plan.part_count };
      if (signal.aborted) {
        // Cancelled while the upload was being created: don't leave an orphan behind.
        abortMultipartUpload(key, session.uploadId).catch(() => undefined);
        throw new DOMException('Upload cancelled', 'AbortError');
      }
      sessions.current.set(item.id, session);
      const record: PendingUpload = {
        key,
        uploadId: session.uploadId,
        partSize: session.partSize,
        partCount: session.partCount,
        contentType,
        fileName: file.name,
        size: file.size,
        lastModified: file.lastModified,
        startedAt: Date.now(),
      };
      rememberPendingUpload(record);
      setPending((prev) => [...prev.filter((p) => p.uploadId !== record.uploadId), record]);
    }
    patchItem(item.id, { uploadId: session.uploadId });

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
    forget(uploadId);
  };

  const run = useCallback(
    async (item: UploadItem, overwrite: boolean) => {
      const release = await fileSlots.current.acquire();
      try {
        if (cancelled.current.has(item.id)) return; // cancelled while waiting for a slot
        const controller = new AbortController();
        controllers.current.set(item.id, controller);
        patchItem(item.id, {
          status: 'uploading',
          errorMsg: undefined,
          ...(sessions.current.has(item.id) ? {} : { progress: 0 }),
        });

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
    // uploadSingle / uploadMultipart only use refs, `patchItem` and `forget`, so they never go stale.
    // oxlint-disable-next-line react-hooks/exhaustive-deps
    [patchItem, forget],
  );

  /** Free the storage held by a half-finished multipart upload. */
  const discard = useCallback(
    (item: UploadItem) => {
      cancelled.current.add(item.id);
      controllers.current.get(item.id)?.abort();
      const session = sessions.current.get(item.id);
      if (session) {
        sessions.current.delete(item.id);
        forget(session.uploadId);
        abortMultipartUpload(item.key, session.uploadId).catch(() => undefined);
      }
    },
    [forget],
  );

  const startUploads = async (
    sources: Array<File | UploadSource>,
    targetPrefix: string,
    onAllComplete?: () => void,
  ) => {
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

  /**
   * Continue unfinished uploads from files the user picked again. A file continues the upload it
   * matches (same name, size and modified time); the parts already in storage are not sent again.
   * Returns the files that matched nothing.
   */
  const resumeFiles = async (files: File[], onAllComplete?: () => void): Promise<File[]> => {
    const open = unfinished.slice();
    const unmatched: File[] = [];
    const items: UploadItem[] = [];
    for (const file of files) {
      const index = open.findIndex((p) => isSameFile(p, file));
      if (index < 0) {
        unmatched.push(file);
        continue;
      }
      const [upload] = open.splice(index, 1);
      const item: UploadItem = {
        id: `upload-${Date.now()}-${nextId.current++}`,
        file,
        key: upload.key,
        progress: 0,
        status: 'pending',
        uploadId: upload.uploadId,
      };
      sessions.current.set(item.id, {
        uploadId: upload.uploadId,
        partSize: upload.partSize,
        partCount: upload.partCount,
      });
      items.push(item);
    }
    if (items.length === 0) return unmatched;

    setQueue((prev) => (prev.some(isActive) ? [...prev, ...items] : items));
    await Promise.all(items.map((item) => run(item, false)));
    onAllComplete?.();
    return unmatched;
  };

  /** Give up on an unfinished upload and free the parts already stored. */
  const discardUnfinished = (uploadId: string) => {
    const upload = pending.find((p) => p.uploadId === uploadId);
    forget(uploadId);
    if (upload) abortMultipartUpload(upload.key, upload.uploadId).catch(() => undefined);
  };

  /** Replace every file that is waiting on a name conflict. */
  const replaceConflicts = async (onComplete?: () => void) => {
    const conflicts = queueRef.current.filter((q) => q.status === 'conflict');
    await Promise.all(conflicts.map((item) => run(item, true)));
    onComplete?.();
  };

  /** Skip every file that is waiting on a name conflict. */
  const skipConflicts = () => {
    setQueue((prev) => prev.filter((q) => q.status !== 'conflict'));
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
    unfinished,
    resumeFiles,
    discardUnfinished,
    replaceItem,
    retryItem,
    cancelItem,
    replaceConflicts,
    skipConflicts,
    dismissItem,
    clearQueue,
  };
}
