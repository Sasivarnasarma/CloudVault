/** Direct browser <-> object storage transfers using presigned URLs (data plane). */

export class TransferError extends Error {
  /** HTTP status from storage, when there was a response. */
  readonly status?: number;
  /** Worth trying again (network drop, throttling, server error, or an expired URL). */
  readonly retryable: boolean;

  constructor(message: string, options: { status?: number; retryable: boolean }) {
    super(message);
    this.name = 'TransferError';
    this.status = options.status;
    this.retryable = options.retryable;
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

interface PutOptions {
  contentType?: string;
  /** Bytes sent so far for this request. */
  onProgress?: (loaded: number, total: number) => void;
  signal?: AbortSignal;
}

function putBlob(url: string, body: Blob, { contentType, onProgress, signal }: PutOptions): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Upload cancelled', 'AbortError'));

    const xhr = new XMLHttpRequest();
    xhr.open('PUT', url, true);
    if (contentType !== undefined) xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');

    if (onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) onProgress(event.loaded, event.total);
      };
    }

    const onAbort = () => xhr.abort();
    signal?.addEventListener('abort', onAbort, { once: true });
    const cleanup = () => signal?.removeEventListener('abort', onAbort);

    xhr.onload = () => {
      cleanup();
      if (xhr.status >= 200 && xhr.status < 300) return resolve();
      const retryable = xhr.status >= 500 || xhr.status === 408 || xhr.status === 429 || xhr.status === 403;
      reject(new TransferError(`Direct storage upload failed with HTTP status ${xhr.status}`, { status: xhr.status, retryable }));
    };
    xhr.onerror = () => {
      cleanup();
      reject(new TransferError('Network error occurred during direct storage upload', { retryable: true }));
    };
    xhr.onabort = () => {
      cleanup();
      reject(new DOMException('Upload cancelled', 'AbortError'));
    };

    xhr.send(body);
  });
}

/** Upload a whole file with one presigned PUT. `onProgress` receives a percentage (0-100). */
export function uploadFileDirect(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return putBlob(uploadUrl, file, {
    contentType: contentType || 'application/octet-stream',
    signal,
    onProgress: onProgress ? (loaded, total) => onProgress(Math.round((loaded / total) * 100)) : undefined,
  });
}

/** Upload one part of a multipart upload. `onProgress` receives bytes sent for this part. */
export function uploadPartDirect(
  partUrl: string,
  part: Blob,
  onProgress?: (loaded: number) => void,
  signal?: AbortSignal,
): Promise<void> {
  return putBlob(partUrl, part, { signal, onProgress: onProgress ? (loaded) => onProgress(loaded) : undefined });
}

export function triggerBrowserDownload(downloadUrl: string): void {
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.rel = 'noopener noreferrer';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
