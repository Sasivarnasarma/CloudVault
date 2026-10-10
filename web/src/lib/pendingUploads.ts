/**
 * Large uploads that were started but not finished, remembered in this browser so they can be
 * resumed after a refresh. Storage keeps the parts that were already sent (and `listUploadedParts`
 * says which); this only remembers which upload belongs to which file, since the page can't keep
 * the file itself. The user picks the file again and the upload continues where it stopped.
 */

export interface PendingUpload {
  key: string;
  uploadId: string;
  partSize: number;
  partCount: number;
  contentType: string;
  /** Identify the file when it is picked again. */
  fileName: string;
  size: number;
  lastModified: number;
  startedAt: number;
}

const STORAGE_KEY = 'cloudvault:pending-uploads';

/** Storage drops incomplete uploads sooner or later and the parts cost money while they wait. */
export const PENDING_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;

function isPending(value: unknown): value is PendingUpload {
  const p = value as Partial<PendingUpload> | null;
  return (
    !!p &&
    typeof p.key === 'string' &&
    typeof p.uploadId === 'string' &&
    typeof p.fileName === 'string' &&
    typeof p.contentType === 'string' &&
    Number.isFinite(p.partSize) &&
    Number.isFinite(p.partCount) &&
    Number.isFinite(p.size) &&
    Number.isFinite(p.lastModified) &&
    Number.isFinite(p.startedAt)
  );
}

function read(): PendingUpload[] {
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]');
    return Array.isArray(parsed) ? parsed.filter(isPending) : [];
  } catch {
    return [];
  }
}

function write(list: PendingUpload[]) {
  try {
    if (list.length === 0) localStorage.removeItem(STORAGE_KEY);
    else localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // Private mode or a full quota: uploads still work, they just can't be resumed after a refresh.
  }
}

/** The uploads that can still be resumed, and the ones that are too old (their parts should be freed). */
export function loadPendingUploads(now = Date.now()): { pending: PendingUpload[]; expired: PendingUpload[] } {
  const all = read();
  const pending = all.filter((p) => now - p.startedAt <= PENDING_MAX_AGE_MS);
  if (pending.length !== all.length) write(pending);
  return { pending, expired: all.filter((p) => !pending.includes(p)) };
}

export function rememberPendingUpload(upload: PendingUpload) {
  write([...read().filter((p) => p.uploadId !== upload.uploadId), upload]);
}

export function forgetPendingUpload(uploadId: string) {
  write(read().filter((p) => p.uploadId !== uploadId));
}

/** Is this the file the upload was started with? Name, size and modified time must all match. */
export function isSameFile(upload: PendingUpload, file: File): boolean {
  return upload.fileName === file.name && upload.size === file.size && upload.lastModified === file.lastModified;
}
