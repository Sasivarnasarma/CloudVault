import { errorMessage } from '../../lib/cn';
import { runPool } from '../../lib/concurrency';
import type { Entry } from '../../lib/entries';
import { copyFolder, deleteFolder, moveFolder } from '../../services/folderService';
import { copyObject, deleteObject, moveObject } from '../../services/objectService';

export interface BulkResult {
  entry: Entry;
  ok: boolean;
  error?: string;
}

interface RunOptions {
  concurrency?: number;
  onProgress?: (done: number, total: number) => void;
}

/** Run `action` for every entry (a few at a time). One failure never stops the others. */
export async function runBulk(
  entries: Entry[],
  action: (entry: Entry) => Promise<void>,
  { concurrency = 4, onProgress }: RunOptions = {},
): Promise<BulkResult[]> {
  const results: BulkResult[] = new Array(entries.length);
  let done = 0;

  await runPool(
    entries.map((_, index) => index),
    concurrency,
    async (index) => {
      const entry = entries[index];
      try {
        await action(entry);
        results[index] = { entry, ok: true };
      } catch (err) {
        results[index] = { entry, ok: false, error: errorMessage(err, 'Failed') };
      }
      done += 1;
      onProgress?.(done, entries.length);
    },
  );

  return results;
}

export async function deleteEntry(entry: Entry): Promise<void> {
  if (entry.type === 'folder') await deleteFolder(entry.folder.prefix);
  else await deleteObject(entry.file.key);
}

/** Move or copy one entry into the folder `destinationPrefix`, keeping its name. */
export async function transferEntry(
  entry: Entry,
  mode: 'move' | 'copy',
  destinationPrefix: string,
  overwrite: boolean,
): Promise<void> {
  const target = `${destinationPrefix}${entry.name}`;

  if (entry.type === 'folder') {
    const source = entry.folder.prefix;
    if (`${target}/`.startsWith(source)) {
      throw new Error(target === source.replace(/\/$/, '') ? 'Already in this folder' : 'A folder can’t be moved or copied into itself');
    }
    await (mode === 'move' ? moveFolder(source, target) : copyFolder(source, target));
    return;
  }

  if (target === entry.file.key) throw new Error('Already in this folder');
  await (mode === 'move'
    ? moveObject(entry.file.key, target, overwrite)
    : copyObject(entry.file.key, target, overwrite));
}

export function summarize(results: BulkResult[]): { succeeded: BulkResult[]; failed: BulkResult[] } {
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
