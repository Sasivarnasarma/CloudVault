import type { FileObject, FolderObject } from '../types';

export type Entry =
  | { type: 'folder'; id: string; name: string; folder: FolderObject }
  | { type: 'file'; id: string; name: string; file: FileObject };

export type TransferMode = 'rename' | 'move' | 'copy';

export type SortKey = 'name' | 'modified' | 'size';
export type SortDir = 'asc' | 'desc';

export function sortEntries(entries: Entry[], key: SortKey, dir: SortDir): Entry[] {
  const factor = dir === 'asc' ? 1 : -1;
  const byName = (a: Entry, b: Entry) =>
    a.name.localeCompare(b.name, undefined, { numeric: true, sensitivity: 'base' });

  const compare = (a: Entry, b: Entry): number => {
    if (a.type === 'file' && b.type === 'file') {
      if (key === 'size') return a.file.size - b.file.size;
      if (key === 'modified') return Date.parse(a.file.last_modified) - Date.parse(b.file.last_modified);
    }
    return byName(a, b);
  };

  const folders = entries.filter((e) => e.type === 'folder').sort((a, b) => byName(a, b) * (key === 'name' ? factor : 1));
  const files = entries.filter((e) => e.type === 'file').sort((a, b) => compare(a, b) * factor);
  return [...folders, ...files];
}
