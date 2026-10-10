import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFolder, createFolder, deleteFolder, moveFolder } from './folderService';
import { fetchHealthStatus } from './healthService';
import { ApiError, jsonBody, request } from './http';
import {
  copyObject,
  deleteObject,
  getObjectMetadata,
  listObjects,
  moveObject,
  requestPresignedDownload,
  requestPresignedUpload,
} from './objectService';
import {
  completeMultipartUpload,
  abortMultipartUpload,
  createMultipartUpload,
  listUploadedParts,
  presignUploadParts,
} from './multipartService';
import {
  isAbortError,
  TransferError,
  triggerBrowserDownload,
  uploadFileDirect,
  uploadPartDirect,
} from './transferService';

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

const fetchMock = vi.fn<typeof fetch>();

beforeEach(() => {
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

function lastCall(): { url: string; init?: RequestInit } {
  const [url, init] = fetchMock.mock.lastCall!;
  return { url: String(url), init };
}

describe('request', () => {
  it('returns parsed JSON on success', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ ok: true }));
    await expect(request('/api/x')).resolves.toEqual({ ok: true });
  });

  it('raises ApiError with the backend detail and status', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'A file with this name already exists' }, 409));
    const error: unknown = await request('/api/x', undefined, 'fallback').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).message).toBe('A file with this name already exists');
    expect((error as ApiError).status).toBe(409);
  });

  it('uses the fallback for non-JSON bodies and validation arrays', async () => {
    fetchMock.mockResolvedValueOnce(new Response('<html>bad gateway</html>', { status: 502 }));
    await expect(request('/api/x', undefined, 'Something failed')).rejects.toThrow('Something failed');

    fetchMock.mockResolvedValueOnce(jsonResponse({ detail: [{ msg: 'field required' }] }, 422));
    await expect(request('/api/x', undefined, 'Invalid input')).rejects.toThrow('Invalid input');
  });

  it('builds JSON POST bodies', () => {
    const init = jsonBody({ a: 1 });
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toEqual({ 'Content-Type': 'application/json' });
  });
});

describe('objectService', () => {
  beforeEach(() => fetchMock.mockImplementation(async () => jsonResponse({})));

  it('lists the root without a query and encodes prefixes', async () => {
    await listObjects();
    expect(lastCall().url).toBe('/api/objects');
    await listObjects('my docs/a&b/');
    expect(lastCall().url).toBe('/api/objects?prefix=my%20docs%2Fa%26b%2F');

    await listObjects('docs/', { limit: 500 });
    expect(lastCall().url).toBe('/api/objects?prefix=docs%2F&limit=500');
    await listObjects('', { limit: 500, cursor: 'a/b==' });
    expect(lastCall().url).toBe('/api/objects?limit=500&cursor=a%2Fb%3D%3D');
  });

  it('encodes keys for metadata and delete requests', async () => {
    await getObjectMetadata('dir/a b.txt');
    expect(lastCall().url).toBe('/api/objects/metadata?key=dir%2Fa%20b.txt');

    await deleteObject('dir/a b.txt');
    expect(lastCall().url).toBe('/api/objects?key=dir%2Fa%20b.txt');
    expect(lastCall().init?.method).toBe('DELETE');
  });

  it('posts upload presign requests as JSON', async () => {
    await requestPresignedUpload('dir/a.txt', 'text/plain', 12);
    const { url, init } = lastCall();
    expect(url).toBe('/api/objects/presign-upload');
    expect(init?.method).toBe('POST');
    expect(JSON.parse(String(init?.body))).toEqual({
      key: 'dir/a.txt',
      content_type: 'text/plain',
      size: 12,
      overwrite: false,
    });

    await requestPresignedUpload('dir/a.txt', 'text/plain', 12, true);
    expect(JSON.parse(String(lastCall().init?.body)).overwrite).toBe(true);
  });

  it('requests download URLs with an optional filename', async () => {
    await requestPresignedDownload('dir/a.txt');
    expect(lastCall().url).toBe('/api/objects/presign-download?key=dir%2Fa.txt');
    await requestPresignedDownload('dir/a.txt', 'My File.txt');
    expect(lastCall().url).toBe('/api/objects/presign-download?key=dir%2Fa.txt&filename=My+File.txt');
  });
});

describe('copy and move services', () => {
  beforeEach(() => fetchMock.mockImplementation(async () => jsonResponse({})));

  it.each([
    ['copy', copyObject],
    ['move', moveObject],
  ] as const)('posts %s requests for files, with overwrite off by default', async (action, fn) => {
    await fn('a/old.txt', 'b/new.txt');
    expect(lastCall().url).toBe(`/api/objects/${action}`);
    expect(lastCall().init?.method).toBe('POST');
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({
      source: 'a/old.txt',
      destination: 'b/new.txt',
      overwrite: false,
    });

    await fn('a/old.txt', 'b/new.txt', true);
    expect(JSON.parse(String(lastCall().init?.body)).overwrite).toBe(true);
  });

  it.each([
    ['copy', copyFolder],
    ['move', moveFolder],
  ] as const)('posts %s requests for folders without an overwrite option', async (action, fn) => {
    await fn('docs/', 'archive/docs');
    expect(lastCall().url).toBe(`/api/folders/${action}`);
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({ source: 'docs/', destination: 'archive/docs' });
  });

  it('surfaces the conflict message and status from the API', async () => {
    fetchMock.mockResolvedValue(jsonResponse({ detail: 'A file with this name already exists' }, 409));
    const error = await moveObject('a.txt', 'b.txt').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).status).toBe(409);
  });
});

describe('multipartService', () => {
  beforeEach(() => fetchMock.mockImplementation(async () => jsonResponse({})));

  it('starts an upload with the file details', async () => {
    await createMultipartUpload('big/a.zip', 123, 'application/zip', true);
    expect(lastCall().url).toBe('/api/uploads/multipart');
    expect(lastCall().init?.method).toBe('POST');
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({
      key: 'big/a.zip',
      size: 123,
      content_type: 'application/zip',
      overwrite: true,
    });
  });

  it('requests part URLs, lists uploaded parts, completes and aborts', async () => {
    await presignUploadParts('k', 'u', [2, 3]);
    expect(lastCall().url).toBe('/api/uploads/multipart/parts');
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({ key: 'k', upload_id: 'u', part_numbers: [2, 3] });

    await listUploadedParts('dir/a b.bin', 'up/1');
    expect(lastCall().url).toBe('/api/uploads/multipart/parts?key=dir%2Fa+b.bin&upload_id=up%2F1');

    await completeMultipartUpload('k', 'u', 7);
    expect(lastCall().url).toBe('/api/uploads/multipart/complete');
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({ key: 'k', upload_id: 'u', part_count: 7 });

    await abortMultipartUpload('k', 'u');
    expect(lastCall().url).toBe('/api/uploads/multipart/abort');
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({ key: 'k', upload_id: 'u' });
  });
});

describe('folder and health services', () => {
  beforeEach(() => fetchMock.mockImplementation(async () => jsonResponse({})));

  it('creates folders with a JSON body and deletes by encoded prefix', async () => {
    await createFolder('docs/new');
    expect(lastCall().url).toBe('/api/folders');
    expect(JSON.parse(String(lastCall().init?.body))).toEqual({ path: 'docs/new' });

    await deleteFolder('docs/old folder/');
    expect(lastCall().url).toBe('/api/folders?prefix=docs%2Fold%20folder%2F');
    expect(lastCall().init?.method).toBe('DELETE');
  });

  it('fetches health from /api/health', async () => {
    await fetchHealthStatus();
    expect(lastCall().url).toBe('/api/health');
  });
});

describe('transferService', () => {
  class FakeXhr {
    static last: FakeXhr;
    method = '';
    url = '';
    headers: Record<string, string> = {};
    status = 200;
    body: unknown;
    upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
    onload?: () => void;
    onerror?: () => void;
    onabort?: () => void;
    aborted = false;

    constructor() {
      FakeXhr.last = this;
    }
    open(method: string, url: string) {
      this.method = method;
      this.url = url;
    }
    setRequestHeader(name: string, value: string) {
      this.headers[name] = value;
    }
    send(body: unknown) {
      this.body = body;
    }
    abort() {
      this.aborted = true;
      this.onabort?.();
    }
  }

  beforeEach(() => vi.stubGlobal('XMLHttpRequest', FakeXhr));

  it('PUTs the file straight to the presigned URL and reports progress', async () => {
    const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
    const progress = vi.fn();
    const promise = uploadFileDirect('https://storage.test/put', file, 'text/plain', progress);

    const xhr = FakeXhr.last;
    expect(xhr.method).toBe('PUT');
    expect(xhr.url).toBe('https://storage.test/put');
    expect(xhr.headers['Content-Type']).toBe('text/plain');
    expect(xhr.body).toBe(file);

    xhr.upload.onprogress?.({ lengthComputable: true, loaded: 1, total: 4 });
    xhr.upload.onprogress?.({ lengthComputable: false, loaded: 0, total: 0 });
    expect(progress).toHaveBeenCalledTimes(1);
    expect(progress).toHaveBeenCalledWith(25);

    xhr.onload?.();
    await expect(promise).resolves.toBeUndefined();
  });

  it('defaults the content type and rejects on HTTP or network failures', async () => {
    const file = new File(['x'], 'a.bin');
    const failed = uploadFileDirect('https://storage.test/put', file, '');
    expect(FakeXhr.last.headers['Content-Type']).toBe('application/octet-stream');
    FakeXhr.last.status = 403;
    FakeXhr.last.onload?.();
    await expect(failed).rejects.toThrow('HTTP status 403');

    const offline = uploadFileDirect('https://storage.test/put', file, 'x/y');
    FakeXhr.last.onerror?.();
    await expect(offline).rejects.toThrow('Network error');
  });

  describe('cancelling and failures', () => {
    const blob = new Blob(['x']);

    it('aborts the request when the signal fires and rejects with an AbortError', async () => {
      const controller = new AbortController();
      const promise = uploadPartDirect('https://storage.test/part/1', blob, undefined, controller.signal);
      controller.abort();
      const error = await promise.catch((e: unknown) => e);
      expect(FakeXhr.last.aborted).toBe(true);
      expect(isAbortError(error)).toBe(true);
    });

    it('does not send anything if it is already cancelled', async () => {
      const controller = new AbortController();
      controller.abort();
      await expect(
        uploadFileDirect(
          'https://storage.test/put',
          new File(['x'], 'a.txt'),
          'text/plain',
          undefined,
          controller.signal,
        ),
      ).rejects.toMatchObject({
        name: 'AbortError',
      });
    });

    it.each([
      [500, true],
      [503, true],
      [429, true],
      [408, true],
      [403, true], // an expired URL: worth retrying with a fresh one
      [400, false],
      [404, false],
    ])('classifies HTTP %i as retryable=%s', async (status, retryable) => {
      const promise = uploadPartDirect('https://storage.test/part/1', blob);
      FakeXhr.last.status = status;
      FakeXhr.last.onload?.();
      const error = (await promise.catch((e: unknown) => e)) as TransferError;
      expect(error).toBeInstanceOf(TransferError);
      expect(error.status).toBe(status);
      expect(error.retryable).toBe(retryable);
    });

    it('treats network failures as retryable', async () => {
      const promise = uploadPartDirect('https://storage.test/part/1', blob);
      FakeXhr.last.onerror?.();
      const error = (await promise.catch((e: unknown) => e)) as TransferError;
      expect(error.retryable).toBe(true);
      expect(error.status).toBeUndefined();
    });

    it('sends parts without a content type and reports bytes sent', async () => {
      const onProgress = vi.fn();
      const promise = uploadPartDirect('https://storage.test/part/1', blob, onProgress);
      expect(FakeXhr.last.headers['Content-Type']).toBeUndefined();
      FakeXhr.last.upload.onprogress?.({ lengthComputable: true, loaded: 123, total: 456 });
      FakeXhr.last.onload?.();
      await promise;
      expect(onProgress).toHaveBeenCalledWith(123);
    });
  });

  it('triggers downloads with an anchor that does not open a new tab', () => {
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    triggerBrowserDownload('https://storage.test/get?sig=1');
    expect(click).toHaveBeenCalledTimes(1);
    const anchor = click.mock.contexts[0] as HTMLAnchorElement;
    expect(anchor.href).toBe('https://storage.test/get?sig=1');
    expect(anchor.target).toBe('');
    expect(anchor.rel).toBe('noopener noreferrer');
    expect(document.body.contains(anchor)).toBe(false);
    click.mockRestore();
  });
});
