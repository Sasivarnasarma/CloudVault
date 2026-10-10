import type { Entry } from './entries';

/** 'a/b/c.txt' -> 'a/b/', 'c.txt' -> '' and 'a/b/' -> 'a/'. */
export function parentPrefix(keyOrPrefix: string): string {
  const parts = keyOrPrefix.replace(/\/+$/, '').split('/');
  parts.pop();
  return parts.length > 0 ? `${parts.join('/')}/` : '';
}

/** "report.pdf" -> "report (copy).pdf", then "report (copy 2).pdf" ...: the first name not in `taken`. */
export function copyName(name: string, taken: ReadonlySet<string>, isFolder = false): string {
  const dot = isFolder ? -1 : name.lastIndexOf('.');
  const stem = dot > 0 ? name.slice(0, dot) : name;
  const extension = dot > 0 ? name.slice(dot) : '';
  for (let n = 1; ; n++) {
    const candidate = `${stem} (copy${n === 1 ? '' : ` ${n}`})${extension}`;
    if (!taken.has(candidate)) return candidate;
  }
}

/** The name to show for a folder prefix: its last segment, or `rootLabel` for the bucket root. */
export function folderLabel(prefix: string, rootLabel: string): string {
  return prefix.replace(/\/+$/, '').split('/').pop() || rootLabel;
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
