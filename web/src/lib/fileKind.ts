import type { FileObject } from '../types';

export type FileCategory = 'documents' | 'images' | 'media' | 'archives' | 'code' | 'other';
export type CategoryFilter = 'all' | 'documents' | 'images' | 'media';

const EXTENSIONS: Record<Exclude<FileCategory, 'other'>, string[]> = {
  images: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'ico'],
  media: ['mp3', 'wav', 'flac', 'ogg', 'mp4', 'mkv', 'mov', 'webm', 'avi'],
  documents: ['pdf', 'doc', 'docx', 'txt', 'md', 'rtf', 'csv', 'xls', 'xlsx', 'ppt', 'pptx'],
  archives: ['zip', 'rar', '7z', 'tar', 'gz', 'tgz', 'bz2'],
  code: ['js', 'ts', 'tsx', 'jsx', 'json', 'py', 'html', 'css', 'sh', 'yml', 'yaml', 'toml', 'sql', 'log'],
};

export function extensionOf(name: string): string {
  const idx = name.lastIndexOf('.');
  return idx > 0 ? name.slice(idx + 1).toLowerCase() : '';
}

export function categoryOf(file: Pick<FileObject, 'name' | 'content_type'>): FileCategory {
  const ext = extensionOf(file.name);
  const type = file.content_type;
  if (type.startsWith('image/') || EXTENSIONS.images.includes(ext)) return 'images';
  if (type.startsWith('audio/') || type.startsWith('video/') || EXTENSIONS.media.includes(ext)) return 'media';
  if (EXTENSIONS.archives.includes(ext)) return 'archives';
  if (EXTENSIONS.code.includes(ext)) return 'code';
  if (type.includes('pdf') || type.startsWith('text/') || EXTENSIONS.documents.includes(ext)) return 'documents';
  return 'other';
}

export function kindLabel(file: Pick<FileObject, 'name'>): string {
  const ext = extensionOf(file.name);
  return ext ? ext.toUpperCase() : 'File';
}

export function matchesFilter(file: FileObject, filter: CategoryFilter): boolean {
  return filter === 'all' || categoryOf(file) === filter;
}
