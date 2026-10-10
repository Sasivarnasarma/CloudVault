import { act, renderHook, waitFor } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import type { FolderTreeResponse } from '../../types';
import { IN_MEMORY_LIMIT_BYTES, useZipDownload } from './useZipDownload';

vi.mock('../../services/folderService', () => ({ fetchFolderTree: vi.fn() }));
vi.mock('../../services/objectService', () => ({ requestPresignedDownloads: vi.fn() }));
import { fetchFolderTree } from '../../services/folderService';
import { requestPresignedDownloads } from '../../services/objectService';

const treeMock = vi.mocked(fetchFolderTree);
const signMock = vi.mocked(requestPresignedDownloads);
const fetchMock = vi.fn<typeof fetch>();

const CONTENT: Record<string, string> = {
  'Photos/a.jpg': 'AAAA-first-file',
  'Photos/2024/b.jpg': 'BBBB-second-file',
  'notes.md': 'NNNN-notes',
};

const PHOTOS_TREE: FolderTreeResponse = {
  prefix: 'Photos/',
  files: [
    { key: 'Photos/a.jpg', size: CONTENT['Photos/a.jpg'].length },
    { key: 'Photos/2024/b.jpg', size: CONTENT['Photos/2024/b.jpg'].length },
  ],
  empty_folders: ['Photos/empty/'],
  total_size: 0,
};

const folderEntry = (name: string): Entry => {
  const folder = makeFolder(name);
  return { type: 'folder', id: folder.prefix, name, folder };
};
const fileEntry = (key: string): Entry => {
  const file = makeFile(key, { name: key.split('/').pop(), size: CONTENT[key]?.length ?? 1 });
  return { type: 'file', id: file.key, name: file.name, file };
};

/** What the browser would write to disk, collected as text (the zip stores files uncompressed). */
function pickerThatCollects() {
  const written: Uint8Array[] = [];
  const picker = vi.fn(async (_options: { suggestedName: string }) => ({
    createWritable: async () =>
      new WritableStream<Uint8Array>({
        write(chunk) {
          written.push(chunk);
        },
      }),
  }));
  (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker = picker;
  const text = () => {
    const all = new Uint8Array(written.reduce((sum, chunk) => sum + chunk.length, 0));
    let offset = 0;
    for (const chunk of written) {
      all.set(chunk, offset);
      offset += chunk.length;
    }
    return new TextDecoder('latin1').decode(all);
  };
  return { picker, text };
}

beforeEach(() => {
  fetchMock.mockReset().mockImplementation(async (input) => {
    const key = decodeURIComponent(String(input).replace('https://storage.test/', ''));
    return new Response(CONTENT[key] ?? 'x');
  });
  vi.stubGlobal('fetch', fetchMock);
  treeMock.mockReset().mockResolvedValue(PHOTOS_TREE);
  signMock.mockReset().mockImplementation(async (keys) => ({
    expires_in: 3600,
    items: keys.map((key) => ({ key, download_url: `https://storage.test/${key}`, expires_in: 3600 })),
  }));
});

afterEach(() => {
  delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  toast.dismiss();
});

describe('useZipDownload (a browser that saves straight to disk)', () => {
  it('zips a folder with everything inside it into the chosen file', async () => {
    const { picker, text } = pickerThatCollects();
    const success = vi.spyOn(toast, 'success');
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([folderEntry('Photos')]));

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Photos.zip' }));
    expect(treeMock).toHaveBeenCalledWith('Photos/', expect.any(AbortSignal));
    const zip = text();
    for (const name of ['Photos/a.jpg', 'Photos/2024/b.jpg', 'Photos/empty/']) expect(zip).toContain(name);
    expect(zip).toContain('AAAA-first-file');
    expect(zip).toContain('BBBB-second-file');
    expect(zip.startsWith('PK')).toBe(true);
    expect(success).toHaveBeenCalledWith(
      'Saved Photos.zip',
      expect.objectContaining({ description: expect.stringContaining('2 files') }),
    );
    expect(result.current.zipping).toBe(false);
  });

  it('zips a selection of files without listing any folder', async () => {
    const { picker, text } = pickerThatCollects();
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([fileEntry('notes.md'), folderEntry('Photos')]));

    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'CloudVault download.zip' }));
    expect(text()).toContain('NNNN-notes');

    treeMock.mockClear();
    await act(() => result.current.download([fileEntry('notes.md')]));
    expect(treeMock).not.toHaveBeenCalled();
  });

  it('shows progress while it works', async () => {
    pickerThatCollects();
    const loading = vi.spyOn(toast, 'loading');
    const { result } = renderHook(() => useZipDownload());
    await act(() => result.current.download([folderEntry('Photos')]));
    expect(loading).toHaveBeenCalledWith('Preparing the zip…', expect.objectContaining({ action: expect.anything() }));
  });

  it('does nothing when the file picker is closed', async () => {
    const { picker } = pickerThatCollects();
    picker.mockRejectedValue(new DOMException('closed', 'AbortError'));
    const error = vi.spyOn(toast, 'error');
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([folderEntry('Photos')]));

    expect(fetchMock).not.toHaveBeenCalled();
    expect(treeMock).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
    expect(result.current.zipping).toBe(false);
  });

  it('can be cancelled while the files are coming in', async () => {
    const { text } = pickerThatCollects();
    fetchMock.mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init?.signal?.addEventListener('abort', () => reject(init.signal?.reason));
        }),
    );
    const loading = vi.spyOn(toast, 'loading');
    const info = vi.spyOn(toast, 'info');
    const { result } = renderHook(() => useZipDownload());

    let finished!: Promise<void>;
    act(() => {
      finished = result.current.download([folderEntry('Photos')]);
    });
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    expect(result.current.zipping).toBe(true);

    const [, options] = loading.mock.calls[loading.mock.calls.length - 1];
    const cancel = (options as unknown as { action: { onClick: () => void } }).action;
    await act(async () => {
      cancel.onClick();
      await finished;
    });

    expect(info).toHaveBeenCalledWith('Zip cancelled');
    expect(result.current.zipping).toBe(false);
    expect(text()).not.toContain('AAAA-first-file');
  });

  it('refuses to start a second zip while one is running', async () => {
    pickerThatCollects();
    fetchMock.mockImplementation(() => new Promise(() => {})); // never answers
    const info = vi.spyOn(toast, 'info');
    const { result } = renderHook(() => useZipDownload());

    act(() => void result.current.download([folderEntry('Photos')]));
    await waitFor(() => expect(fetchMock).toHaveBeenCalled());
    await act(() => result.current.download([fileEntry('notes.md')]));

    expect(info).toHaveBeenCalledWith(expect.stringContaining('already being made'));
  });

  it('names the file it could not read, and why', async () => {
    pickerThatCollects();
    fetchMock.mockResolvedValue(new Response('', { status: 403 }));
    const error = vi.spyOn(toast, 'error');
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([folderEntry('Photos')]));

    expect(error).toHaveBeenCalledWith(
      'Couldn’t read “Photos/a.jpg”',
      expect.objectContaining({ description: expect.stringContaining('answered 403') }),
    );
    expect(result.current.zipping).toBe(false);
  });

  it('points at the bucket’s CORS rule when storage cannot be reached', async () => {
    pickerThatCollects();
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    vi.spyOn(globalThis, 'setTimeout').mockImplementation(((fn: () => void) => {
      fn();
      return 0;
    }) as unknown as typeof setTimeout);
    const error = vi.spyOn(toast, 'error');
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([folderEntry('Photos')]));

    expect(error).toHaveBeenCalledWith(
      'Couldn’t read “Photos/a.jpg”',
      expect.objectContaining({ description: expect.stringContaining('CORS') }),
    );
  });

  it('reports a folder that could not be listed', async () => {
    pickerThatCollects();
    treeMock.mockRejectedValue(new Error('This folder has more than 10,000 files: too many to zip'));
    const error = vi.spyOn(toast, 'error');
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([folderEntry('Photos')]));

    expect(error).toHaveBeenCalledWith(
      'Couldn’t make the zip',
      expect.objectContaining({ description: expect.stringContaining('too many to zip') }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('ignores an empty selection', async () => {
    const { picker } = pickerThatCollects();
    const { result } = renderHook(() => useZipDownload());
    await act(() => result.current.download([]));
    expect(picker).not.toHaveBeenCalled();
  });
});

describe('useZipDownload (a browser that builds the zip in memory)', () => {
  let saved: { blob: Blob; name: string }[];

  beforeEach(() => {
    saved = [];
    const blobs: Blob[] = [];
    vi.stubGlobal('URL', {
      ...URL,
      createObjectURL: (blob: Blob) => {
        blobs.push(blob);
        return `blob:${blobs.length}`;
      },
      revokeObjectURL: () => {},
    });
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
      saved.push({ blob: blobs[Number(this.href.replace('blob:', '')) - 1], name: this.download });
    });
  });

  it('downloads the finished zip under its name', async () => {
    const { result } = renderHook(() => useZipDownload());
    await act(() => result.current.download([folderEntry('Photos')]));

    expect(saved).toHaveLength(1);
    expect(saved[0].name).toBe('Photos.zip');
    const text = new TextDecoder('latin1').decode(await saved[0].blob.arrayBuffer());
    expect(text).toContain('Photos/2024/b.jpg');
    expect(text).toContain('BBBB-second-file');
  });

  it('refuses a zip too big to build in memory, before fetching anything', async () => {
    treeMock.mockResolvedValue({
      ...PHOTOS_TREE,
      files: [{ key: 'Photos/huge.bin', size: IN_MEMORY_LIMIT_BYTES + 1 }],
    });
    const error = vi.spyOn(toast, 'error');
    const { result } = renderHook(() => useZipDownload());

    await act(() => result.current.download([folderEntry('Photos')]));

    expect(error).toHaveBeenCalledWith(
      'Couldn’t make the zip',
      expect.objectContaining({ description: expect.stringContaining('Chrome or Edge') }),
    );
    expect(fetchMock).not.toHaveBeenCalled();
    expect(saved).toEqual([]);
  });
});
