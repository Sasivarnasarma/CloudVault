import type { UploadSource } from '../features/upload/useUpload';

/** Files the operating system adds on its own; uploading them is never what the user wants. */
const JUNK_FILES = new Set(['.ds_store', 'thumbs.db', 'desktop.ini']);

export interface DroppedContent {
  /** Files with their path relative to the drop target, e.g. `photos/2026/a.jpg`. */
  sources: UploadSource[];
  /** Folders that contain no files at all; they would otherwise be lost. */
  emptyFolders: string[];
  /** Number of junk files left out. */
  skipped: number;
}

const isJunk = (name: string) => JUNK_FILES.has(name.toLowerCase());

function readAllEntries(reader: FileSystemDirectoryReader): Promise<FileSystemEntry[]> {
  // readEntries returns results in batches (about 100 at a time) until it yields an empty list.
  return new Promise((resolve, reject) => {
    const all: FileSystemEntry[] = [];
    const next = () =>
      reader.readEntries((batch) => {
        if (batch.length === 0) return resolve(all);
        all.push(...batch);
        next();
      }, reject);
    next();
  });
}

function fileOf(entry: FileSystemFileEntry): Promise<File> {
  return new Promise((resolve, reject) => entry.file(resolve, reject));
}

async function walk(entry: FileSystemEntry, parent: string, out: DroppedContent): Promise<void> {
  const path = parent ? `${parent}/${entry.name}` : entry.name;

  if (entry.isFile) {
    if (isJunk(entry.name)) {
      out.skipped += 1;
      return;
    }
    out.sources.push({ file: await fileOf(entry as FileSystemFileEntry), path });
    return;
  }

  if (entry.isDirectory) {
    const children = await readAllEntries((entry as FileSystemDirectoryEntry).createReader());
    const before = out.sources.length;
    for (const child of children) await walk(child, path, out);
    if (out.sources.length === before && children.every((c) => !c.isDirectory)) out.emptyFolders.push(path);
  }
}

/**
 * Reads everything in a drop: loose files and whole folders (recursively).
 * Must be called synchronously from the drop event, because the browser invalidates the items afterwards.
 */
export function readDroppedItems(items: DataTransferItemList | null | undefined): Promise<DroppedContent> {
  const entries: FileSystemEntry[] = [];
  const loose: File[] = [];

  for (const item of Array.from(items ?? [])) {
    if (item.kind !== 'file') continue;
    const entry = item.webkitGetAsEntry?.();
    if (entry) entries.push(entry);
    else {
      const file = item.getAsFile();
      if (file) loose.push(file);
    }
  }

  return (async () => {
    const out: DroppedContent = { sources: loose.map((file) => ({ file })), emptyFolders: [], skipped: 0 };
    for (const entry of entries) await walk(entry, '', out);
    return out;
  })();
}

/** Turns the result of an `<input webkitdirectory>` picker into upload sources with relative paths. */
export function fromDirectoryInput(files: File[]): DroppedContent {
  const out: DroppedContent = { sources: [], emptyFolders: [], skipped: 0 };
  for (const file of files) {
    if (isJunk(file.name)) {
      out.skipped += 1;
      continue;
    }
    out.sources.push({ file, path: file.webkitRelativePath || file.name });
  }
  return out;
}
