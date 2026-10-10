/** Saving a generated file to the user's disk, streaming it where the browser allows. */

interface WritableFileHandle {
  createWritable(): Promise<WritableStream<Uint8Array>>;
}

interface SaveFilePickerWindow {
  showSaveFilePicker?: (options: {
    suggestedName: string;
    types: { description: string; accept: Record<string, string[]> }[];
  }) => Promise<WritableFileHandle>;
}

export interface FileSink {
  /** True when the data goes to disk as it arrives; false when the whole file is built in memory first. */
  streaming: boolean;
  write(data: ReadableStream<Uint8Array>): Promise<void>;
}

/** Keep a few seconds for the browser to start the download before the temporary link is released. */
const BLOB_URL_LIFETIME_MS = 60_000;

/** Hand a finished file to the browser's download, under this name. */
export function saveBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), BLOB_URL_LIFETIME_MS);
}

/**
 * Where to write a zip file. Chrome and Edge ask for a place on disk and stream to it, which has no
 * size limit; other browsers build the file in memory and download it at the end. Call this first in
 * a click handler, because the file picker needs the click.
 *
 * Returns null when the user closes the picker without choosing.
 */
export async function openZipSink(filename: string): Promise<FileSink | null> {
  const picker = (window as SaveFilePickerWindow).showSaveFilePicker;
  if (!picker) {
    return {
      streaming: false,
      write: async (data) =>
        saveBlob(await new Response(data, { headers: { 'Content-Type': 'application/zip' } }).blob(), filename),
    };
  }

  let handle: WritableFileHandle;
  try {
    handle = await picker.call(window, {
      suggestedName: filename,
      types: [{ description: 'Zip archive', accept: { 'application/zip': ['.zip'] } }],
    });
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') return null;
    throw err;
  }
  return {
    streaming: true,
    write: async (data) => data.pipeTo(await handle.createWritable()),
  };
}
