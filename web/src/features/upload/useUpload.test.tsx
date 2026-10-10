import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { TransferError } from '../../services/transferService';
import { MULTIPART_THRESHOLD, useUpload } from './useUpload';

vi.mock('../../lib/concurrency', async (importActual) => ({
  ...(await importActual<typeof import('../../lib/concurrency')>()),
  delay: vi.fn(async () => undefined), // no real backoff waits in tests
}));
vi.mock('../../services/objectService', () => ({ requestPresignedUpload: vi.fn() }));
vi.mock('../../services/multipartService', () => ({
  createMultipartUpload: vi.fn(),
  presignUploadParts: vi.fn(),
  listUploadedParts: vi.fn(),
  completeMultipartUpload: vi.fn(),
  abortMultipartUpload: vi.fn(),
}));
vi.mock('../../services/transferService', async (importActual) => ({
  ...(await importActual<typeof import('../../services/transferService')>()),
  uploadFileDirect: vi.fn(),
  uploadPartDirect: vi.fn(),
}));
import {
  abortMultipartUpload,
  completeMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  presignUploadParts,
} from '../../services/multipartService';
import { requestPresignedUpload } from '../../services/objectService';
import { uploadFileDirect, uploadPartDirect } from '../../services/transferService';

const presignMock = vi.mocked(requestPresignedUpload);
const uploadMock = vi.mocked(uploadFileDirect);
const partMock = vi.mocked(uploadPartDirect);
const createMock = vi.mocked(createMultipartUpload);
const partUrlsMock = vi.mocked(presignUploadParts);
const listPartsMock = vi.mocked(listUploadedParts);
const completeMock = vi.mocked(completeMultipartUpload);
const abortMock = vi.mocked(abortMultipartUpload);

const MIB = 1024 * 1024;
const PART_SIZE = 32 * MIB;

type Gate = ReturnType<typeof deferred<void>>;

const file = (name: string, type = 'text/plain') => new File(['data'], name, { type });

/** A File that reports a large size without allocating it. */
function bigFile(name: string, size: number, type = 'application/octet-stream'): File {
  const f = new File(['x'], name, { type });
  Object.defineProperty(f, 'size', { value: size });
  f.slice = (start = 0, end = size) => {
    const part = new Blob(['x']);
    Object.defineProperty(part, 'size', { value: Math.min(end, size) - start });
    return part;
  };
  return f;
}

const plan = (size: number) => ({
  key: 'k',
  upload_id: 'u1',
  part_size: PART_SIZE,
  part_count: Math.ceil(size / PART_SIZE),
});

function deferred<T = void>() {
  let resolve!: (value: T) => void;
  let reject!: (error: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

beforeEach(() => {
  localStorage.clear();
  for (const m of [
    presignMock,
    uploadMock,
    partMock,
    createMock,
    partUrlsMock,
    listPartsMock,
    completeMock,
    abortMock,
  ]) {
    m.mockReset();
  }
  presignMock.mockImplementation(async (key) => ({
    upload_url: `https://storage.test/${key}`,
    headers: {},
    key,
    method: 'PUT',
    expires_in: 900,
  }));
  uploadMock.mockResolvedValue(undefined);
  createMock.mockImplementation(async (_key, size) => plan(size));
  partUrlsMock.mockImplementation(async (_key, _id, numbers) => ({
    parts: numbers.map((n) => ({ part_number: n, url: `https://storage.test/part/${n}` })),
    expires_in: 3600,
  }));
  partMock.mockImplementation(async (_url, blob, onProgress) => onProgress?.(blob.size));
  listPartsMock.mockResolvedValue({ parts: [] });
  completeMock.mockResolvedValue({ success: true, key: 'k', etag: 'e' });
  abortMock.mockResolvedValue({ success: true });
});

describe('useUpload: single uploads', () => {
  it('uploads files directly to storage under the target folder', async () => {
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());

    await act(() => result.current.startUploads([file('a.txt'), file('b.bin', '')], 'docs', done));

    expect(presignMock).toHaveBeenCalledWith('docs/a.txt', 'text/plain', 4, false);
    expect(presignMock).toHaveBeenCalledWith('docs/b.bin', 'application/octet-stream', 4, false);
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls[0][0]).toBe('https://storage.test/docs/a.txt');
    expect(uploadMock.mock.calls[0][4]).toBeInstanceOf(AbortSignal);
    expect(result.current.queue.map((q) => [q.status, q.progress])).toEqual([
      ['completed', 100],
      ['completed', 100],
    ]);
    expect(result.current.isUploading).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();
  });

  it('uploads to the root without a prefix and honours relative paths', async () => {
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('a.txt')], ''));
    expect(presignMock.mock.calls[0][0]).toBe('a.txt');

    await act(() => result.current.startUploads([{ file: file('c.txt'), path: 'photos/2026/c.txt' }], 'docs/'));
    expect(presignMock).toHaveBeenLastCalledWith('docs/photos/2026/c.txt', 'text/plain', 4, false);
  });

  it('keeps going after a conflict and surfaces the reason', async () => {
    presignMock.mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());

    await act(() => result.current.startUploads([file('dup.txt'), file('ok.txt')], 'docs/', done));

    const [first, second] = result.current.queue;
    expect(first.status).toBe('conflict');
    expect(first.errorMsg).toBe('A file with this name already exists');
    expect(second.status).toBe('completed');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('flags name conflicts separately from other failures', async () => {
    presignMock.mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('dup.txt')], 'docs/'));
    expect(result.current.queue[0]).toMatchObject({ status: 'conflict', key: 'docs/dup.txt' });

    presignMock.mockRejectedValueOnce(new ApiError('Storage service is unavailable', 503));
    await act(() => result.current.startUploads([file('other.txt')], 'docs/'));
    expect(result.current.queue[0]).toMatchObject({ status: 'error', errorMsg: 'Storage service is unavailable' });
  });

  it('replaces a conflicting file by re-uploading with overwrite', async () => {
    presignMock.mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('dup.txt')], 'docs/'));

    await act(() => result.current.replaceItem(result.current.queue[0], done));

    expect(presignMock).toHaveBeenLastCalledWith('docs/dup.txt', 'text/plain', 4, true);
    expect(result.current.queue[0]).toMatchObject({ status: 'completed', progress: 100, errorMsg: undefined });
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('skips a conflicting file by dropping it from the queue', async () => {
    presignMock.mockRejectedValueOnce(new ApiError('exists', 409));
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('dup.txt'), file('ok.txt')], ''));

    act(() => result.current.dismissItem(result.current.queue[0].id));
    expect(result.current.queue.map((q) => q.file.name)).toEqual(['ok.txt']);
  });

  it('marks the upload as failed when the direct transfer fails, and retry works', async () => {
    uploadMock.mockRejectedValueOnce(
      new TransferError('Direct storage upload failed with HTTP status 400', { status: 400, retryable: false }),
    );
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('a.txt')], ''));
    expect(result.current.queue[0]).toMatchObject({ status: 'error', errorMsg: expect.stringContaining('400') });

    await act(() => result.current.retryItem(result.current.queue[0]));
    expect(result.current.queue[0].status).toBe('completed');
  });

  it('tracks progress and the uploading flag while a transfer is running', async () => {
    const gate = deferred();
    uploadMock.mockImplementationOnce(async (_url, _file, _type, onProgress) => {
      onProgress?.(40);
      await gate.promise;
    });
    const { result } = renderHook(() => useUpload());

    let running!: Promise<void>;
    act(() => {
      running = result.current.startUploads([file('big.bin')], '');
    });
    await waitFor(() => expect(result.current.queue[0]?.progress).toBe(40));
    expect(result.current.isUploading).toBe(true);
    expect(result.current.queue[0].status).toBe('uploading');

    await act(async () => {
      gate.resolve();
      await running;
    });
    expect(result.current.isUploading).toBe(false);
  });

  it('ignores empty selections and can clear the queue', async () => {
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([], '', done));
    expect(done).not.toHaveBeenCalled();
    expect(result.current.queue).toEqual([]);

    await act(() => result.current.startUploads([file('a.txt')], ''));
    expect(result.current.queue).toHaveLength(1);
    act(() => result.current.clearQueue());
    expect(result.current.queue).toEqual([]);
  });
});

describe('useUpload: bulk conflicts', () => {
  const conflictAll = () => {
    presignMock.mockImplementation(async (key, _type, _size, overwrite) => {
      if (!overwrite) throw new ApiError('A file with this name already exists', 409);
      return { upload_url: `https://storage.test/${key}`, headers: {}, key, method: 'PUT', expires_in: 900 };
    });
  };

  it('replaces every conflicting file at once', async () => {
    conflictAll();
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('a.txt'), file('b.txt'), file('c.txt')], ''));
    expect(result.current.queue.map((q) => q.status)).toEqual(['conflict', 'conflict', 'conflict']);

    await act(() => result.current.replaceConflicts(done));
    expect(result.current.queue.map((q) => q.status)).toEqual(['completed', 'completed', 'completed']);
    expect(presignMock.mock.calls.filter((c) => c[3] === true)).toHaveLength(3);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('skips every conflicting file but keeps the rest of the queue', async () => {
    presignMock.mockImplementation(async (key) => {
      if (key.startsWith('dup')) throw new ApiError('exists', 409);
      return { upload_url: `https://storage.test/${key}`, headers: {}, key, method: 'PUT', expires_in: 900 };
    });
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('dup1.txt'), file('ok.txt'), file('dup2.txt')], ''));

    act(() => result.current.skipConflicts());
    expect(result.current.queue.map((q) => q.file.name)).toEqual(['ok.txt']);
  });
});

describe('useUpload: queue behaviour', () => {
  it('uploads at most three files at a time', async () => {
    let running = 0;
    let peak = 0;
    const gates: Gate[] = [];
    uploadMock.mockImplementation(async () => {
      running++;
      peak = Math.max(peak, running);
      const gate = deferred();
      gates.push(gate);
      await gate.promise;
      running--;
    });
    const { result } = renderHook(() => useUpload());

    let batch!: Promise<void>;
    act(() => {
      batch = result.current.startUploads(
        ['a', 'b', 'c', 'd', 'e'].map((n) => file(`${n}.txt`)),
        '',
      );
    });
    await waitFor(() => expect(gates).toHaveLength(3));
    expect(result.current.queue.map((q) => q.status)).toEqual([
      'uploading',
      'uploading',
      'uploading',
      'pending',
      'pending',
    ]);

    for (let i = 0; i < 5; i++) {
      await waitFor(() => expect(gates.length).toBeGreaterThan(i));
      await act(async () => gates[i].resolve());
    }
    await act(async () => batch);
    expect(peak).toBe(3);
    expect(uploadMock).toHaveBeenCalledTimes(5);
  });

  it('adds new uploads to a running queue but starts fresh once idle', async () => {
    const gate = deferred();
    uploadMock.mockImplementationOnce(() => gate.promise);
    const { result } = renderHook(() => useUpload());

    let first!: Promise<void>;
    act(() => {
      first = result.current.startUploads([file('first.txt')], '');
    });
    await waitFor(() => expect(result.current.isUploading).toBe(true));

    await act(() => result.current.startUploads([file('second.txt')], ''));
    expect(result.current.queue.map((q) => q.file.name)).toEqual(['first.txt', 'second.txt']);

    await act(async () => {
      gate.resolve();
      await first;
    });
    await act(() => result.current.startUploads([file('third.txt')], ''));
    expect(result.current.queue.map((q) => q.file.name)).toEqual(['third.txt']);
  });

  it('cancelling a waiting upload keeps it from ever starting', async () => {
    const gates: Gate[] = [];
    uploadMock.mockImplementation(() => {
      const gate = deferred();
      gates.push(gate);
      return gate.promise;
    });
    const { result } = renderHook(() => useUpload());

    let batch!: Promise<void>;
    act(() => {
      batch = result.current.startUploads(
        ['a', 'b', 'c', 'd'].map((n) => file(`${n}.txt`)),
        '',
      );
    });
    await waitFor(() => expect(gates).toHaveLength(3));

    act(() => result.current.cancelItem(result.current.queue[3].id));
    expect(result.current.queue[3]).toMatchObject({ status: 'cancelled' });

    await act(async () => {
      gates.forEach((g) => g.resolve());
      await batch;
    });
    expect(uploadMock).toHaveBeenCalledTimes(3);
    expect(result.current.queue[3].status).toBe('cancelled');
  });

  it('cancelling a running single upload aborts its request', async () => {
    let signal: AbortSignal | undefined;
    uploadMock.mockImplementationOnce(
      (_url, _file, _type, _progress, sig) =>
        new Promise<void>((_resolve, reject) => {
          signal = sig;
          sig?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
        }),
    );
    const { result } = renderHook(() => useUpload());

    let batch!: Promise<void>;
    act(() => {
      batch = result.current.startUploads([file('a.txt')], '');
    });
    await waitFor(() => expect(signal).toBeDefined());
    act(() => result.current.cancelItem(result.current.queue[0].id));
    await act(async () => batch);

    expect(signal?.aborted).toBe(true);
    expect(result.current.queue[0]).toMatchObject({ status: 'cancelled', errorMsg: 'Upload cancelled' });
    expect(result.current.isUploading).toBe(false);
  });
});

describe('useUpload: multipart uploads', () => {
  it('uses a single request up to the threshold and parts above it', async () => {
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('at-limit.bin', MULTIPART_THRESHOLD)], ''));
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(createMock).not.toHaveBeenCalled();

    await act(() => result.current.startUploads([bigFile('over.bin', MULTIPART_THRESHOLD + 1)], ''));
    expect(createMock).toHaveBeenCalledTimes(1);
  });

  it('uploads every part, then completes with the part count', async () => {
    const size = 100 * MIB; // 4 parts: 3 x 32 MiB + 4 MiB
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('big.zip', size, 'application/zip')], 'backups/'));

    expect(createMock).toHaveBeenCalledWith('backups/big.zip', size, 'application/zip', false);
    expect(partUrlsMock.mock.calls.flatMap((c) => c[2]).sort()).toEqual([1, 2, 3, 4]);
    expect(partMock).toHaveBeenCalledTimes(4);
    const sizes = partMock.mock.calls.map((c) => c[1].size).sort((a, b) => a - b);
    expect(sizes).toEqual([4 * MIB, PART_SIZE, PART_SIZE, PART_SIZE]);
    expect(completeMock).toHaveBeenCalledWith('backups/big.zip', 'u1', 4);
    expect(uploadMock).not.toHaveBeenCalled();
    expect(result.current.queue[0]).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('sends at most four parts at the same time', async () => {
    let running = 0;
    let peak = 0;
    partMock.mockImplementation(async (_url, blob, onProgress) => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 5));
      onProgress?.(blob.size);
      running--;
    });
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('huge.bin', 8 * PART_SIZE)], ''));

    expect(partMock).toHaveBeenCalledTimes(8);
    expect(peak).toBe(4);
  });

  it('reports overall progress from the parts sent so far', async () => {
    const gate = deferred();
    partMock.mockImplementation(async (_url, blob, onProgress) => {
      onProgress?.(blob.size);
      await gate.promise;
    });
    const { result } = renderHook(() => useUpload());

    let batch!: Promise<void>;
    act(() => {
      batch = result.current.startUploads([bigFile('x.bin', 4 * PART_SIZE)], '');
    });
    await waitFor(() => expect(result.current.queue[0]?.progress).toBe(99)); // capped until the upload is assembled
    await act(async () => {
      gate.resolve();
      await batch;
    });
    expect(result.current.queue[0].progress).toBe(100);
  });

  it('retries a part that fails for a transient reason, using a fresh URL', async () => {
    let failedOnce = false;
    partMock.mockImplementation(async (url, blob, onProgress) => {
      if (url.endsWith('/2') && !failedOnce) {
        failedOnce = true;
        throw new TransferError('Network error occurred during direct storage upload', { retryable: true });
      }
      onProgress?.(blob.size);
    });
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('flaky.bin', 3 * PART_SIZE)], ''));

    expect(result.current.queue[0].status).toBe('completed');
    expect(partUrlsMock.mock.calls.filter((c) => c[2][0] === 2)).toHaveLength(2);
    expect(completeMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after repeated failures and keeps the upload for a later retry', async () => {
    partMock.mockRejectedValue(
      new TransferError('Network error occurred during direct storage upload', { retryable: true }),
    );
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('down.bin', 3 * PART_SIZE)], ''));

    expect(result.current.queue[0].status).toBe('error');
    expect(completeMock).not.toHaveBeenCalled();
    expect(abortMock).not.toHaveBeenCalled(); // parts stay on storage so the upload can resume
  });

  it('does not retry errors that cannot succeed', async () => {
    partMock.mockRejectedValue(
      new TransferError('Direct storage upload failed with HTTP status 400', { status: 400, retryable: false }),
    );
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('bad.bin', 3 * PART_SIZE)], ''));
    expect(result.current.queue[0].status).toBe('error');
    expect(partMock).toHaveBeenCalledTimes(3); // exactly one attempt per part: no backoff retries
  });

  it('resumes a failed upload by sending only the parts storage does not have', async () => {
    partMock.mockImplementation(async (url, blob, onProgress) => {
      if (url.endsWith('/2')) throw new TransferError('HTTP status 400', { status: 400, retryable: false });
      onProgress?.(blob.size);
    });
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('resume.bin', 3 * PART_SIZE)], ''));
    expect(result.current.queue[0].status).toBe('error');

    partMock.mockReset();
    partMock.mockImplementation(async (_url, blob, onProgress) => onProgress?.(blob.size));
    listPartsMock.mockResolvedValue({
      parts: [
        { part_number: 1, size: PART_SIZE, etag: 'e1' },
        { part_number: 3, size: PART_SIZE, etag: 'e3' },
      ],
    });
    await act(() => result.current.retryItem(result.current.queue[0]));

    expect(createMock).toHaveBeenCalledTimes(1); // same upload, not a new one
    expect(listPartsMock).toHaveBeenCalledWith('resume.bin', 'u1');
    expect(partMock).toHaveBeenCalledTimes(1);
    expect(partUrlsMock).toHaveBeenLastCalledWith('resume.bin', 'u1', [2]);
    expect(completeMock).toHaveBeenCalledWith('resume.bin', 'u1', 3);
    expect(result.current.queue[0]).toMatchObject({ status: 'completed', progress: 100 });
  });

  it('treats a name conflict when starting as a conflict and replaces on request', async () => {
    createMock.mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('dup.bin', 3 * PART_SIZE)], ''));
    expect(result.current.queue[0].status).toBe('conflict');

    await act(() => result.current.replaceItem(result.current.queue[0]));
    expect(createMock).toHaveBeenLastCalledWith('dup.bin', 3 * PART_SIZE, 'application/octet-stream', true);
    expect(result.current.queue[0].status).toBe('completed');
  });

  it('does not mistake an incomplete-upload error on completion for a name conflict', async () => {
    completeMock.mockRejectedValueOnce(new ApiError('1 part(s) are missing', 409));
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('x.bin', 3 * PART_SIZE)], ''));
    expect(result.current.queue[0]).toMatchObject({ status: 'error', errorMsg: '1 part(s) are missing' });
  });

  it('cancelling aborts the in-flight parts and discards the upload on storage', async () => {
    const signals: AbortSignal[] = [];
    partMock.mockImplementation(
      (_url, _blob, _progress, signal) =>
        new Promise<void>((_resolve, reject) => {
          signals.push(signal!);
          signal?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
        }),
    );
    const { result } = renderHook(() => useUpload());

    let batch!: Promise<void>;
    act(() => {
      batch = result.current.startUploads([bigFile('cancel.bin', 4 * PART_SIZE)], '');
    });
    await waitFor(() => expect(signals).toHaveLength(4));

    act(() => result.current.cancelItem(result.current.queue[0].id));
    await act(async () => batch);

    expect(signals.every((s) => s.aborted)).toBe(true);
    expect(abortMock).toHaveBeenCalledWith('cancel.bin', 'u1');
    expect(completeMock).not.toHaveBeenCalled();
    expect(result.current.queue[0]).toMatchObject({ status: 'cancelled' });
  });

  it('discards the stored parts when a failed upload is dismissed or the queue is cleared', async () => {
    partMock.mockRejectedValue(new TransferError('HTTP status 400', { status: 400, retryable: false }));
    const { result } = renderHook(() => useUpload());
    await act(() =>
      result.current.startUploads([bigFile('a.bin', 3 * PART_SIZE), bigFile('b.bin', 3 * PART_SIZE)], ''),
    );
    expect(result.current.queue.every((q) => q.status === 'error')).toBe(true);

    act(() => result.current.dismissItem(result.current.queue[0].id));
    expect(abortMock).toHaveBeenCalledTimes(1);
    act(() => result.current.clearQueue());
    expect(abortMock).toHaveBeenCalledTimes(2);
    expect(abortMock.mock.calls.map((c) => c[0]).sort()).toEqual(['a.bin', 'b.bin']);
  });

  it('warns before the tab closes while uploads are running', async () => {
    const gate = deferred();
    uploadMock.mockImplementationOnce(() => gate.promise);
    const { result } = renderHook(() => useUpload());

    let batch!: Promise<void>;
    act(() => {
      batch = result.current.startUploads([file('a.txt')], '');
    });
    await waitFor(() => expect(result.current.isUploading).toBe(true));

    const during = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(during);
    expect(during.defaultPrevented).toBe(true);

    await act(async () => {
      gate.resolve();
      await batch;
    });
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });
});

describe('useUpload: resuming after a refresh', () => {
  /** Start a three-part upload that stops after part 1, as if the page was closed. */
  async function interruptedUpload(name = 'big.bin') {
    const big = bigFile(name, 3 * PART_SIZE);
    partMock.mockImplementation(async (url, blob, onProgress) => {
      if (!url.endsWith('/1')) throw new TransferError('HTTP status 400', { status: 400, retryable: false });
      onProgress?.(blob.size);
    });
    const first = renderHook(() => useUpload());
    await act(() => first.result.current.startUploads([big], 'docs'));
    first.unmount();
    partUrlsMock.mockClear();
    partMock.mockReset();
    partMock.mockImplementation(async (_url, blob, onProgress) => onProgress?.(blob.size));
    return big;
  }

  it('remembers a started multipart upload and forgets it once it is complete', async () => {
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([bigFile('ok.bin', 3 * PART_SIZE)], ''));

    expect(completeMock).toHaveBeenCalled();
    expect(localStorage.getItem('cloudvault:pending-uploads')).toBeNull();
    expect(result.current.unfinished).toEqual([]);
  });

  it('lists the upload that was cut short after a reload, but not as part of the new queue', async () => {
    await interruptedUpload();
    const { result } = renderHook(() => useUpload());

    expect(result.current.queue).toEqual([]);
    expect(result.current.unfinished).toEqual([
      expect.objectContaining({ key: 'docs/big.bin', uploadId: 'u1', fileName: 'big.bin', partCount: 3 }),
    ]);
  });

  it('continues it from the same file, sending only the parts storage does not have', async () => {
    const big = await interruptedUpload();
    listPartsMock.mockResolvedValue({ parts: [{ part_number: 1, size: PART_SIZE, etag: 'e1' }] });
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());

    let unmatched!: File[];
    await act(async () => {
      unmatched = await result.current.resumeFiles([big], done);
    });

    expect(unmatched).toEqual([]);
    expect(createMock).toHaveBeenCalledTimes(1); // only the original start
    expect(listPartsMock).toHaveBeenCalledWith('docs/big.bin', 'u1');
    expect(partUrlsMock.mock.calls.map((c) => c[2])).toEqual(expect.arrayContaining([[2], [3]]));
    expect(partUrlsMock).not.toHaveBeenCalledWith('docs/big.bin', 'u1', [1]);
    expect(completeMock).toHaveBeenCalledWith('docs/big.bin', 'u1', 3);
    expect(result.current.queue[0]).toMatchObject({ key: 'docs/big.bin', status: 'completed' });
    expect(result.current.unfinished).toEqual([]);
    expect(localStorage.getItem('cloudvault:pending-uploads')).toBeNull();
    expect(done).toHaveBeenCalled();
  });

  it('only continues with a file that matches, and gives back the others', async () => {
    await interruptedUpload();
    const { result } = renderHook(() => useUpload());
    const other = bigFile('big.bin', 3 * PART_SIZE + 1); // same name, different size

    let unmatched!: File[];
    await act(async () => {
      unmatched = await result.current.resumeFiles([other]);
    });

    expect(unmatched).toEqual([other]);
    expect(result.current.queue).toEqual([]);
    expect(listPartsMock).not.toHaveBeenCalled();
    expect(result.current.unfinished).toHaveLength(1);
  });

  it('starts over when storage no longer has the upload', async () => {
    const big = await interruptedUpload();
    listPartsMock.mockRejectedValue(new ApiError('The upload was not found', 404));
    createMock.mockResolvedValue({ key: 'docs/big.bin', upload_id: 'u2', part_size: PART_SIZE, part_count: 3 });
    const { result } = renderHook(() => useUpload());

    await act(async () => void (await result.current.resumeFiles([big])));

    expect(createMock).toHaveBeenCalledTimes(2);
    expect(completeMock).toHaveBeenCalledWith('docs/big.bin', 'u2', 3);
    expect(result.current.queue[0].status).toBe('completed');
    expect(localStorage.getItem('cloudvault:pending-uploads')).toBeNull();
  });

  it('can give up on it, which frees the stored parts', async () => {
    await interruptedUpload();
    const { result } = renderHook(() => useUpload());

    act(() => result.current.discardUnfinished('u1'));

    expect(abortMock).toHaveBeenCalledWith('docs/big.bin', 'u1');
    expect(result.current.unfinished).toEqual([]);
    expect(localStorage.getItem('cloudvault:pending-uploads')).toBeNull();
  });

  it('frees uploads that have been waiting for too long', async () => {
    const old = {
      key: 'old.bin',
      uploadId: 'old1',
      partSize: PART_SIZE,
      partCount: 2,
      contentType: 'application/octet-stream',
      fileName: 'old.bin',
      size: 2 * PART_SIZE,
      lastModified: 1,
      startedAt: Date.now() - 8 * 24 * 60 * 60 * 1000,
    };
    localStorage.setItem('cloudvault:pending-uploads', JSON.stringify([old]));

    const { result } = renderHook(() => useUpload());

    expect(result.current.unfinished).toEqual([]);
    await waitFor(() => expect(abortMock).toHaveBeenCalledWith('old.bin', 'old1'));
  });
});
