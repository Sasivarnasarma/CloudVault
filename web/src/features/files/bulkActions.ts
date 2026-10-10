import { errorMessage } from '../../lib/cn';
import { runPool } from '../../lib/concurrency';
import type { Entry } from '../../lib/entries';
import { copyFolder, deleteFolder, moveFolder } from '../../services/folderService';
import { copyObject, deleteObject, moveObject } from '../../services/objectService';

export interface BulkResult<T = void> {
  entry: Entry;
  ok: boolean;
  /** What the action returned for this entry, when it worked. */
  value?: T;
  error?: string;
}

interface RunOptions {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Run `action` for every entry (a few at a time). One failure never stops the others. */
export async function runBulk<T>(
  entries: Entry[],
  action: (entry: Entry) => Promise<T>,
  { concurrency = 4, onProgress }: RunOptions = {},
): Promise<BulkResult<T>[]> {
  const results: BulkResult<T>[] = new Array(entries.length);
  let done = 0;

  await runPool(
    entries.map((_, index) => index),
    concurrency,
    async (index) => {
      const entry = entries[index];
      try {
        results[index] = { entry, ok: true, value: await action(entry) };
      } catch (err) {
        results[index] = { entry, ok: false, error: errorMessage(err, 'Failed') };
      }
      done += 1;
      onProgress?.(done, entries.length);
    },
  );

  return results;
}

/** Delete a file or a folder with everything in it. Returns how many items were removed. */
export async function deleteEntry(entry: Entry): Promise<number> {
  if (entry.type === 'folder') return (await deleteFolder(entry.folder.prefix)).deleted_count;
  await deleteObject(entry.file.key);
  return 1;
}

/** Move or copy one entry into the folder `destinationPrefix`, keeping its name unless `name` is given. */
export async function transferEntry(
  entry: Entry,
  mode: 'move' | 'copy',
  destinationPrefix: string,
  overwrite: boolean,
  name: string = entry.name,
): Promise<void> {
  const target = `${destinationPrefix}${name}`;

  if (entry.type === 'folder') {
    const source = entry.folder.prefix;
    if (`${target}/`.startsWith(source)) {
      throw new Error(
        target === source.replace(/\/$/, '')
          ? 'Already in this folder'
          : 'A folder can’t be moved or copied into itself',
      );
    }
    await (mode === 'move' ? moveFolder(source, target) : copyFolder(source, target));
    return;
  }

  if (target === entry.file.key) throw new Error('Already in this folder');
  await (mode === 'move'
    ? moveObject(entry.file.key, target, overwrite)
    : copyObject(entry.file.key, target, overwrite));
}

export function summarize<T>(results: BulkResult<T>[]): { succeeded: BulkResult<T>[]; failed: BulkResult<T>[] } {
  return { succeeded: results.filter((r) => r.ok), failed: results.filter((r) => !r.ok) };
}

/** "3 files and 1 folder" */
export function describeEntries(entries: Entry[]): string {
  const folders = entries.filter((e) => e.type === 'folder').length;
  const files = entries.length - folders;
  const parts: string[] = [];
  if (files) parts.push(`${files} file${files === 1 ? '' : 's'}`);
  if (folders) parts.push(`${folders} folder${folders === 1 ? '' : 's'}`);
  return parts.join(' and ');
}
