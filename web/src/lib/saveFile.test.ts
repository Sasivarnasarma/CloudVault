import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { openZipSink, saveBlob } from './saveFile';

type PickerWindow = { showSaveFilePicker?: unknown };

afterEach(() => {
  delete (window as PickerWindow).showSaveFilePicker;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('saveBlob', () => {
  it('downloads the blob through a temporary link and releases it later', () => {
    vi.useFakeTimers();
    const create = vi.fn(() => 'blob:abc');
    const revoke = vi.fn();
    vi.stubGlobal('URL', { createObjectURL: create, revokeObjectURL: revoke });
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});

    saveBlob(new Blob(['x']), 'a.zip');

    const link = click.mock.contexts[0] as HTMLAnchorElement;
    expect(link.download).toBe('a.zip');
    expect(link.getAttribute('href')).toBe('blob:abc');
    expect(document.querySelector('a[download]')).toBeNull(); // the link does not stay on the page
    expect(revoke).not.toHaveBeenCalled();
    vi.advanceTimersByTime(60_000);
    expect(revoke).toHaveBeenCalledWith('blob:abc');
  });
});

describe('openZipSink', () => {
  describe('without a file picker', () => {
    beforeEach(() => {
      vi.stubGlobal('URL', { createObjectURL: () => 'blob:1', revokeObjectURL: () => {} });
      vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    });

    it('builds the file in memory and downloads it when done', async () => {
      const sink = await openZipSink('a.zip');
      expect(sink?.streaming).toBe(false);

      const create = vi.spyOn(URL, 'createObjectURL');
      await sink!.write(new Response('zip-bytes').body!);
      const blob = create.mock.calls[0][0] as Blob;
      expect(await blob.text()).toBe('zip-bytes');
      expect(blob.size).toBe(9);
    });
  });

  describe('with a file picker', () => {
    const useHandle = (writable: WritableStream<Uint8Array>) => {
      const picker = vi.fn(async () => ({ createWritable: async () => writable }));
      (window as PickerWindow).showSaveFilePicker = picker;
      return picker;
    };

    it('asks where to save a zip and streams the data to that file', async () => {
      const chunks: Uint8Array[] = [];
      const picker = useHandle(new WritableStream({ write: (chunk) => void chunks.push(chunk) }));

      const sink = await openZipSink('Photos.zip');
      expect(picker).toHaveBeenCalledWith({
        suggestedName: 'Photos.zip',
        types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }],
      });
      expect(sink?.streaming).toBe(true);

      await sink!.write(new Response('zip-bytes').body!);
      expect(new TextDecoder().decode(chunks[0])).toBe('zip-bytes');
    });

    it('returns nothing when the picker is closed', async () => {
      (window as PickerWindow).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('', 'AbortError'));
      expect(await openZipSink('a.zip')).toBeNull();
    });

    it('passes on any other error', async () => {
      (window as PickerWindow).showSaveFilePicker = vi.fn().mockRejectedValue(new DOMException('', 'SecurityError'));
      await expect(openZipSink('a.zip')).rejects.toThrow();
    });
  });
});
