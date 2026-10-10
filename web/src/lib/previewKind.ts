import type { FileObject } from '../types';
import { extensionOf } from './fileKind';

export type PreviewKind = 'image' | 'video' | 'audio' | 'pdf' | 'text';

const EXTENSIONS: Record<PreviewKind, string[]> = {
  image: ['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif', 'bmp', 'ico'],
  video: ['mp4', 'webm', 'mov', 'm4v', 'ogv'],
  audio: ['mp3', 'wav', 'flac', 'ogg', 'oga', 'm4a', 'aac', 'opus'],
  pdf: ['pdf'],
  text: [
    'txt',
    'md',
    'markdown',
    'json',
    'csv',
    'tsv',
    'log',
    'xml',
    'yml',
    'yaml',
    'toml',
    'ini',
    'conf',
    'js',
    'mjs',
    'ts',
    'tsx',
    'jsx',
    'py',
    'css',
    'html',
    'htm',
    'sh',
    'sql',
    'java',
    'go',
    'rs',
    'c',
    'h',
    'cpp',
  ],
};

/** How a file can be shown in the preview, or null when the browser can't show it. */
export function previewKindOf(file: Pick<FileObject, 'name' | 'content_type'>): PreviewKind | null {
  const ext = extensionOf(file.name);
  const type = file.content_type;
  if (type.startsWith('image/') || EXTENSIONS.image.includes(ext)) return 'image';
  if (type.startsWith('video/') || EXTENSIONS.video.includes(ext)) return 'video';
  if (type.startsWith('audio/') || EXTENSIONS.audio.includes(ext)) return 'audio';
  if (type === 'application/pdf' || EXTENSIONS.pdf.includes(ext)) return 'pdf';
  if (type.startsWith('text/') || type === 'application/json' || EXTENSIONS.text.includes(ext)) return 'text';
  return null;
}

export const canPreview = (file: Pick<FileObject, 'name' | 'content_type'>) => previewKindOf(file) !== null;
