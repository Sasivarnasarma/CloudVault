import { afterEach, describe, expect, it, vi } from 'vitest';
import { copyFolder, moveFolder } from './folderService';
import { ApiError, requestWithProgress } from './http';

function stream(chunks: string[], init: ResponseInit = { status: 200 }) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  const fetchMock = vi.fn(async (_url: string, _init?: RequestInit) => new Response(body, init));
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const event = (e: object) => JSON.stringify(e) + '\n';

afterEach(() => vi.unstubAllGlobals());

describe('requestWithProgress', () => {
  it('reports progress as it arrives and returns the result', async () => {
    const fetchMock = stream([
      event({ type: 'progress', done: 0, total: 2 }),
      event({ type: 'progress', done: 1, total: 2 }),
      event({ type: 'done', result: { item_count: 2 } }),
    ]);
    const seen: number[] = [];
    const result = await requestWithProgress('/api/x', { method: 'POST' }, (p) => seen.push(p.done));

    expect(result).toEqual({ item_count: 2 });
    expect(seen).toEqual([0, 1]);
    const [, init] = fetchMock.mock.calls[0];
    expect(init?.headers).toMatchObject({ Accept: 'application/x-ndjson' });
  });

  it('copes with events split across chunks', async () => {
    const line = event({ type: 'progress', done: 7, total: 9 });
    stream([line.slice(0, 10), line.slice(10), event({ type: 'done', result: 'ok' })]);
    const seen: number[] = [];
    await expect(requestWithProgress('/api/x', {}, (p) => seen.push(p.done))).resolves.toBe('ok');
    expect(seen).toEqual([7]);
  });

  it('turns an error event into an ApiError with the status the server gave', async () => {
    stream([event({ type: 'progress', done: 0, total: 1 }), event({ type: 'error', status: 409, detail: 'Exists' })]);
    await expect(requestWithProgress('/api/x', {}, () => undefined)).rejects.toMatchObject({
      message: 'Exists',
      status: 409,
    });
  });

  it('reads the error of a request the server refused before it started', async () => {
    stream([JSON.stringify({ detail: 'Invalid object key' })], { status: 400 });
    await expect(requestWithProgress('/api/x', {}, () => undefined)).rejects.toBeInstanceOf(ApiError);
  });

  it('fails when the connection ends before a result', async () => {
    stream([event({ type: 'progress', done: 1, total: 5 })]);
    await expect(requestWithProgress('/api/x', {}, () => undefined, 'Failed to copy')).rejects.toMatchObject({
      message: 'Failed to copy',
    });
  });

  it('passes the abort signal to the request', async () => {
    const fetchMock = stream([event({ type: 'done', result: 1 })]);
    const controller = new AbortController();
    await requestWithProgress('/api/x', {}, () => undefined, 'x', controller.signal);
    expect(fetchMock.mock.calls[0][1]?.signal).toBe(controller.signal);
  });
});

describe('folder transfers', () => {
  it('stay a plain request when nobody follows the progress', async () => {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify({ item_count: 1 })));
    vi.stubGlobal('fetch', fetchMock);
    await copyFolder('a/', 'b');
    const [, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect((init.headers as Record<string, string>).Accept).toBeUndefined();
  });

  it('stream when a progress callback is given', async () => {
    const fetchMock = stream([event({ type: 'done', result: { item_count: 3 } })]);
    await expect(moveFolder('a/', 'b', { onProgress: () => undefined })).resolves.toEqual({ item_count: 3 });
    expect(fetchMock.mock.calls[0][0]).toBe('/api/folders/move');
  });
});
