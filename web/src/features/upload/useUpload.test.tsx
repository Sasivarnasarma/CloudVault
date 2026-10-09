import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { useUpload } from './useUpload';

vi.mock('../../services/objectService', () => ({ requestPresignedUpload: vi.fn() }));
vi.mock('../../services/transferService', () => ({ uploadFileDirect: vi.fn() }));
import { requestPresignedUpload } from '../../services/objectService';
import { uploadFileDirect } from '../../services/transferService';

const presignMock = vi.mocked(requestPresignedUpload);
const uploadMock = vi.mocked(uploadFileDirect);

const file = (name: string, type = 'text/plain') => new File(['data'], name, { type });

beforeEach(() => {
  presignMock.mockReset();
  uploadMock.mockReset();
  presignMock.mockImplementation(async (key) => ({
    upload_url: `https://storage.test/${key}`,
    headers: {},
    key,
    method: 'PUT',
    expires_in: 900,
  }));
  uploadMock.mockResolvedValue(undefined);
});

describe('useUpload', () => {
  it('uploads files directly to storage under the target folder', async () => {
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());

    await act(() => result.current.startUploads([file('a.txt'), file('b.bin', '')], 'docs', done));

    expect(presignMock).toHaveBeenNthCalledWith(1, 'docs/a.txt', 'text/plain', 4);
    expect(presignMock).toHaveBeenNthCalledWith(2, 'docs/b.bin', 'application/octet-stream', 4);
    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(uploadMock.mock.calls[0][0]).toBe('https://storage.test/docs/a.txt');
    expect(result.current.queue.map((q) => [q.status, q.progress])).toEqual([
      ['completed', 100],
      ['completed', 100],
    ]);
    expect(result.current.isUploading).toBe(false);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('uploads to the root without a prefix', async () => {
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('a.txt')], ''));
    expect(presignMock.mock.calls[0][0]).toBe('a.txt');
  });

  it('keeps going after a failure and surfaces the reason', async () => {
    presignMock.mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const done = vi.fn();
    const { result } = renderHook(() => useUpload());

    await act(() => result.current.startUploads([file('dup.txt'), file('ok.txt')], 'docs/', done));

    const [first, second] = result.current.queue;
    expect(first.status).toBe('error');
    expect(first.errorMsg).toBe('A file with this name already exists');
    expect(second.status).toBe('completed');
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(done).toHaveBeenCalledTimes(1);
  });

  it('marks the upload as failed when the direct transfer fails', async () => {
    uploadMock.mockRejectedValueOnce(new Error('Direct storage upload failed with HTTP status 403'));
    const { result } = renderHook(() => useUpload());
    await act(() => result.current.startUploads([file('a.txt')], ''));
    expect(result.current.queue[0]).toMatchObject({ status: 'error', errorMsg: expect.stringContaining('403') });
  });

  it('tracks progress and the uploading flag while a transfer is running', async () => {
    let finish!: () => void;
    uploadMock.mockImplementationOnce((_url, _file, _type, onProgress) => {
      onProgress?.(40);
      return new Promise<void>((resolve) => {
        finish = resolve;
      });
    });
    const { result } = renderHook(() => useUpload());

    let running!: Promise<void>;
    act(() => {
      running = result.current.startUploads([file('big.bin')], '');
    });
    await vi.waitFor(() => expect(result.current.queue[0]?.progress).toBe(40));
    expect(result.current.isUploading).toBe(true);
    expect(result.current.queue[0].status).toBe('uploading');

    await act(async () => {
      finish();
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
