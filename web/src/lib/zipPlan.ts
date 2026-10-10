import type { Entry } from './entries';
import type { FolderTreeResponse } from '../types';

/** One file to put in the zip: where to read it and where it goes in the archive. */
export interface ZipFile {
  key: string;
  /** Path inside the archive, e.g. "Photos/2024/a.jpg". */
  path: string;
  size: number;
}

export interface ZipPlan {
  files: ZipFile[];
  /** Folders that need an entry of their own because nothing inside them would create it. Paths end in "/". */
  folders: string[];
  totalSize: number;
}

/** Name of the zip for these entries: the folder's name, or a general one for a selection. */
export function archiveName(entries: Entry[]): string {
  const [only] = entries;
  const base = entries.length === 1 ? only.name : 'CloudVault download';
  return `${base.replace(/[\\/:*?"<>|]/g, '_')}.zip`;
}

/** Make `path` unique among `taken` by adding " (2)", " (3)" ... before the extension. Case does not matter. */
function uniquePath(path: string, taken: Set<string>): string {
  const isFolder = path.endsWith('/');
  const bare = isFolder ? path.slice(0, -1) : path;
  const slash = bare.lastIndexOf('/') + 1;
  const dot = isFolder ? -1 : bare.lastIndexOf('.');
  const hasExtension = dot > slash;
  const stem = hasExtension ? bare.slice(0, dot) : bare;
  const extension = hasExtension ? bare.slice(dot) : '';
  const suffix = isFolder ? '/' : '';

  let candidate = path;
  for (let n = 2; taken.has(candidate.toLowerCase()); n++) candidate = `${stem} (${n})${extension}${suffix}`;
  taken.add(candidate.toLowerCase());
  return candidate;
}

/**
 * What goes in the zip for the selected entries. A file goes in at the top; a folder keeps its name
 * with everything inside it below. `trees` holds the listing of each selected folder, by prefix.
 */
export function planZip(entries: Entry[], trees: ReadonlyMap<string, FolderTreeResponse>): ZipPlan {
  const taken = new Set<string>();
  const files: ZipFile[] = [];
  const folders: string[] = [];

  for (const entry of entries) {
    if (entry.type === 'file') {
      files.push({ key: entry.file.key, path: uniquePath(entry.name, taken), size: entry.file.size });
      continue;
    }

    const tree = trees.get(entry.folder.prefix);
    if (!tree) throw new Error(`The contents of “${entry.name}” were not loaded`);
    const root = uniquePath(`${entry.name}/`, taken);
    const inside = (key: string) => root + key.slice(entry.folder.prefix.length);

    for (const file of tree.files) files.push({ key: file.key, path: inside(file.key), size: file.size });
    // A folder with files in it is created by them; only empty ones need an entry.
    if (tree.files.length === 0) folders.push(root);
    for (const prefix of tree.empty_folders) {
      if (prefix !== entry.folder.prefix) folders.push(inside(prefix));
    }
  }

  return { files, folders, totalSize: files.reduce((sum, f) => sum + f.size, 0) };
}
