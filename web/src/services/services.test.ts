import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createFolder, deleteFolder } from './folderService';
import { fetchHealthStatus } from './healthService';
import { ApiError, jsonBody, request } from './http';
import {
  deleteObject,
  getObjectMetadata,
  listObjects,
  requestPresignedDownload,
  requestPresignedUpload,
} from './objectService';
import { triggerBrowserDownload, uploadFileDirect } from './transferService';

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
    expect(JSON.parse(String(init?.body))).toEqual({ key: 'dir/a.txt', content_type: 'text/plain', size: 12 });
  });

  it('requests download URLs with an optional filename', async () => {
    await requestPresignedDownload('dir/a.txt');
    expect(lastCall().url).toBe('/api/objects/presign-download?key=dir%2Fa.txt');
    await requestPresignedDownload('dir/a.txt', 'My File.txt');
    expect(lastCall().url).toBe('/api/objects/presign-download?key=dir%2Fa.txt&filename=My+File.txt');
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
