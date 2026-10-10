import { requestPresignedDownloads } from '../../services/objectService';
import type { ZipFile, ZipPlan } from '../../lib/zipPlan';

/** Files are signed this many at a time, just before they are fetched, so the links never go stale. */
const SIGN_BATCH_SIZE = 50;
/** Pauses before each retry of a file that could not be fetched. */
export const RETRY_DELAYS_MS = [400, 1200];

/** A file of the zip could not be read from storage. */
export class ZipFileError extends Error {
  readonly path: string;
  readonly reason: 'blocked' | 'status';
  readonly status?: number;

  constructor(path: string, reason: 'blocked' | 'status', status?: number) {
    super(`Couldn’t read “${path}”`);
    this.name = 'ZipFileError';
    this.path = path;
    this.reason = reason;
    this.status = status;
  }
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(resolve, ms);
    signal.addEventListener(
      'abort',
      () => {
        clearTimeout(timer);
        reject(signal.reason);
      },
      { once: true },
    );
  });
}

/** One attempt at a file: the response, or what went wrong. A cancelled request still throws. */
async function tryFetch(url: string, path: string, signal: AbortSignal): Promise<Response | ZipFileError> {
  try {
    const res = await fetch(url, { signal });
    return res.ok ? res : new ZipFileError(path, 'status', res.status);
  } catch (err) {
    if (signal.aborted) throw err;
    // The browser gives no details when the network or a CORS rule stops a request.
    return new ZipFileError(path, 'blocked');
  }
}

/**
 * Fetch a file from storage, trying again after a short pause when the network or storage hiccups.
 * A link that was refused or a file that is gone (a 4xx answer) is not retried.
 */
export async function fetchWithRetry(
  url: string,
  path: string,
  signal: AbortSignal,
  delays: readonly number[] = RETRY_DELAYS_MS,
): Promise<Response> {
  for (let attempt = 0; ; attempt++) {
    const result = await tryFetch(url, path, signal);
    if (result instanceof Response) return result;

    const status = result.status ?? 0;
    const retryable = result.reason === 'blocked' || status === 429 || status >= 500;
    if (!retryable || attempt >= delays.length) throw result;
    await sleep(delays[attempt], signal);
  }
}

/** Pass the bytes of a stream along while telling `onBytes` how many went by. */
function counted(body: ReadableStream<Uint8Array>, onBytes: (count: number) => void): ReadableStream<Uint8Array> {
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        onBytes(chunk.byteLength);
        controller.enqueue(chunk);
      },
    }),
  );
}

export interface ZipProgress {
  onBytes: (count: number) => void;
  /** A file of the zip has been fully handed over. */
  onFile: () => void;
}

/**
 * The entries of the zip, one at a time as the zip is written: first the empty folders, then each
 * file fetched straight from storage. Nothing is read before it is needed, so memory stays small.
 */
export async function* zipEntries(plan: ZipPlan, signal: AbortSignal, progress: ZipProgress) {
  for (const folder of plan.folders) yield { name: folder };

  for (let start = 0; start < plan.files.length; start += SIGN_BATCH_SIZE) {
    const batch: ZipFile[] = plan.files.slice(start, start + SIGN_BATCH_SIZE);
    const { items } = await requestPresignedDownloads(
      batch.map((f) => f.key),
      signal,
    );
    const urls = new Map(items.map((item) => [item.key, item.download_url]));

    for (const file of batch) {
      signal.throwIfAborted();
      const url = urls.get(file.key);
      if (!url) throw new ZipFileError(file.path, 'status', 404);
      const res = await fetchWithRetry(url, file.path, signal);
      const body = res.body ?? new Blob([await res.arrayBuffer()]).stream();
      yield { name: file.path, input: counted(body, progress.onBytes) };
      progress.onFile();
    }
  }
}
