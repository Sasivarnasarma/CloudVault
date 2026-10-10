import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ZipPlan } from '../../lib/zipPlan';
import { fetchWithRetry, zipEntries, ZipFileError } from './zipDownload';

vi.mock('../../services/objectService', () => ({ requestPresignedDownloads: vi.fn() }));
import { requestPresignedDownloads } from '../../services/objectService';

const signMock = vi.mocked(requestPresignedDownloads);
const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
  signMock.mockReset().mockImplementation(async (keys) => ({
    expires_in: 3600,
    items: keys.map((key) => ({ key, download_url: `https://storage.test/${key}`, expires_in: 3600 })),
  }));
});
afterEach(() => vi.unstubAllGlobals());

const ok = (text = 'data') => new Response(text);
const signal = () => new AbortController().signal;

describe('fetchWithRetry', () => {
  it('returns the response of a file that can be read', async () => {
    fetchMock.mockResolvedValue(ok('hello'));
    const res = await fetchWithRetry('https://storage.test/a', 'a.txt', signal(), [0]);
    expect(await res.text()).toBe('hello');
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('tries again after a server error and after a network failure', async () => {
    fetchMock
      .mockResolvedValueOnce(new Response('', { status: 503 }))
      .mockRejectedValueOnce(new TypeError('Failed to fetch'))
      .mockResolvedValueOnce(ok());
    await fetchWithRetry('u', 'a.txt', signal(), [0, 0]);
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it('retries a "too many requests" answer', async () => {
    fetchMock.mockResolvedValueOnce(new Response('', { status: 429 })).mockResolvedValueOnce(ok());
    await fetchWithRetry('u', 'a.txt', signal(), [0]);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('does not retry a refused link or a missing file', async () => {
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    await expect(fetchWithRetry('u', 'a.txt', signal(), [0, 0])).rejects.toMatchObject({
      name: 'ZipFileError',
      path: 'a.txt',
      reason: 'status',
      status: 403,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('gives up after the last retry and says the storage could not be reached', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    await expect(fetchWithRetry('u', 'a.txt', signal(), [0, 0])).rejects.toMatchObject({ reason: 'blocked' });
    expect(fetchMock).toHaveBeenCalledTimes(3);

    fetchMock.mockReset().mockResolvedValue(new Response('', { status: 500 }));
    await expect(fetchWithRetry('u', 'a.txt', signal(), [0])).rejects.toMatchObject({ reason: 'status', status: 500 });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops at once when cancelled, and does not call that a failure of the file', async () => {
    const controller = new AbortController();
    fetchMock.mockImplementation(async () => {
      controller.abort(new DOMException('Cancelled', 'AbortError'));
      throw new DOMException('Cancelled', 'AbortError');
    });
    const error = await fetchWithRetry('u', 'a.txt', controller.signal, [0, 0]).catch((e) => e);
    expect(error).not.toBeInstanceOf(ZipFileError);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});

describe('zipEntries', () => {
  const plan = (count: number, folders: string[] = []): ZipPlan => ({
    files: Array.from({ length: count }, (_, i) => ({ key: `d/f${i}`, path: `d/f${i}`, size: 4 })),
    folders,
    totalSize: count * 4,
  });
  const collect = async (p: ZipPlan, progress = { onBytes: vi.fn(), onFile: vi.fn() }, s = signal()) => {
    const entries = [];
    for await (const entry of zipEntries(p, s, progress)) entries.push(entry);
    return { entries, progress };
  };

  beforeEach(() => fetchMock.mockImplementation(async () => ok('abcd')));

  it('lists empty folders first, then the files in order', async () => {
    const { entries } = await collect(plan(2, ['d/empty/']));
    expect(entries.map((e) => e.name)).toEqual(['d/empty/', 'd/f0', 'd/f1']);
  });

  it('signs the files in batches of fifty, only when they are needed', async () => {
    const { entries } = await collect(plan(120));
    expect(entries).toHaveLength(120);
    expect(signMock.mock.calls.map(([keys]) => keys.length)).toEqual([50, 50, 20]);
  });

  it('counts the bytes that go by and the files that are done', async () => {
    const { entries, progress } = await collect(plan(2));
    for (const entry of entries) {
      if ('input' in entry && entry.input) {
        const reader = (entry.input as ReadableStream<Uint8Array>).getReader();
        while (!(await reader.read()).done);
      }
    }
    expect(progress.onBytes.mock.calls.reduce((sum, [n]) => sum + n, 0)).toBe(8);
    expect(progress.onFile).toHaveBeenCalledTimes(2);
  });

  it('fails with the file’s path when its link was not returned', async () => {
    signMock.mockResolvedValue({ items: [], expires_in: 3600 });
    await expect(collect(plan(1))).rejects.toMatchObject({ path: 'd/f0', status: 404 });
  });

  it('stops when cancelled', async () => {
    const controller = new AbortController();
    controller.abort(new DOMException('Cancelled', 'AbortError'));
    await expect(collect(plan(2), undefined, controller.signal)).rejects.toThrow();
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
