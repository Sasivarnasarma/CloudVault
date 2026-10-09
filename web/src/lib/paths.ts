import type { Entry } from './entries';

/** 'a/b/c.txt' -> 'a/b/', 'c.txt' -> '' and 'a/b/' -> 'a/'. */
export function parentPrefix(keyOrPrefix: string): string {
  const parts = keyOrPrefix.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.length > 0 ? `${parts.join('/')}/` : '';
}

/** The identifying path of an entry: the object key for files, the prefix for folders. */
export function entryPath(entry: Entry): string {
  return entry.type === 'folder' ? entry.folder.prefix : entry.file.key;
}

/** Validates a single file or folder name (no path separators or reserved names). */
export function validateEntryName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return 'Enter a name.';
  if (/[/\\]/.test(trimmed)) return 'Names can’t contain / or \\.';
  // eslint-disable-next-line no-control-regex
  if (/[\x00-\x1f\x7f]/.test(trimmed)) return 'Names can’t contain control characters.';
  if (trimmed === '.' || trimmed === '..') return 'That name isn’t allowed.';
  if (new TextEncoder().encode(trimmed).length > 255) return 'That name is too long.';
  return null;
}
