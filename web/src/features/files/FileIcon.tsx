import {
  Archive,
  FileCode2,
  FileText,
  File as FileGeneric,
  Image as ImageIcon,
  Music2,
} from 'lucide-react';
import type { ComponentType } from 'react';
import { cn } from '../../lib/cn';
import { categoryOf, type FileCategory } from '../../lib/fileKind';
import type { FileObject } from '../../types';

type Size = 'sm' | 'md' | 'lg';

const CATEGORY_STYLE: Record<FileCategory, { icon: ComponentType<{ className?: string }>; tone: string }> = {
  documents: { icon: FileText, tone: 'bg-[#e4ecf5] text-[#2d5f93] dark:bg-[#1b2735] dark:text-[#8db8e8]' },
  images: { icon: ImageIcon, tone: 'bg-[#f6e3dc] text-[#b3502f] dark:bg-[#34211b] dark:text-[#ee9c7e]' },
  media: { icon: Music2, tone: 'bg-[#ece4f2] text-[#6b4a8a] dark:bg-[#2a2132] dark:text-[#c4a4e0]' },
  archives: { icon: Archive, tone: 'bg-[#f3ebd2] text-[#8a6a14] dark:bg-[#33291a] dark:text-[#e0c067]' },
  code: { icon: FileCode2, tone: 'bg-[#dcebe4] text-[#1f6b57] dark:bg-[#1d2f29] dark:text-[#6fcfae]' },
  other: { icon: FileGeneric, tone: 'bg-sunken text-ink-2' },
};

const BOX: Record<Size, string> = {
  sm: 'size-8 rounded-lg',
  md: 'size-11 rounded-xl',
  lg: 'size-16 rounded-2xl',
};
const GLYPH: Record<Size, string> = { sm: 'size-4', md: 'size-5', lg: 'size-8' };

export function FileIcon({ file, size = 'md' }: { file: Pick<FileObject, 'name' | 'content_type'>; size?: Size }) {
  const { icon: Icon, tone } = CATEGORY_STYLE[categoryOf(file)];
  return (
    <span className={cn('inline-flex shrink-0 items-center justify-center', BOX[size], tone)}>
      <Icon className={GLYPH[size]} />
    </span>
  );
}

const FOLDER_SIZE: Record<Size, string> = { sm: 'size-8', md: 'size-11', lg: 'size-16' };

export function FolderIcon({ size = 'md' }: { size?: Size }) {
  return (
    <svg viewBox="0 0 48 48" className={cn('shrink-0', FOLDER_SIZE[size])} aria-hidden="true">
      <path
        d="M4 13a4 4 0 0 1 4-4h10.2a4 4 0 0 1 2.9 1.25l2.1 2.25H40a4 4 0 0 1 4 4V36a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V13Z"
        className="fill-folder-deep"
      />
      <path d="M4 20a4 4 0 0 1 4-4h32a4 4 0 0 1 4 4v16a4 4 0 0 1-4 4H8a4 4 0 0 1-4-4V20Z" className="fill-folder" />
    </svg>
  );
}
