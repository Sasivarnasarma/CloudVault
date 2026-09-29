import {
  FileText,
  Image as ImageIcon,
  FileCode,
  FileSpreadsheet,
  FileArchive,
  Music,
  Video,
  File as GenericFile,
} from 'lucide-react';

interface FileIconProps {
  fileName: string;
  contentType?: string;
  className?: string;
}

export function FileIcon({ fileName, contentType, className = 'w-5 h-5' }: FileIconProps) {
  const ext = fileName.split('.').pop()?.toLowerCase() || '';

  if (['png', 'jpg', 'jpeg', 'gif', 'svg', 'webp', 'avif'].includes(ext) || contentType?.startsWith('image/')) {
    return <ImageIcon className={`${className} text-rose-400`} />;
  }
  if (['mp4', 'webm', 'mkv', 'mov', 'avi'].includes(ext) || contentType?.startsWith('video/')) {
    return <Video className={`${className} text-purple-400`} />;
  }
  if (['mp3', 'wav', 'ogg', 'flac', 'm4a'].includes(ext) || contentType?.startsWith('audio/')) {
    return <Music className={`${className} text-amber-400`} />;
  }
  if (['zip', 'tar', 'gz', 'rar', '7z', 'bz2'].includes(ext)) {
    return <FileArchive className={`${className} text-amber-500`} />;
  }
  if (['js', 'ts', 'tsx', 'jsx', 'py', 'json', 'html', 'css', 'go', 'rs', 'cpp', 'c', 'sh'].includes(ext)) {
    return <FileCode className={`${className} text-cyan-400`} />;
  }
  if (['csv', 'xlsx', 'xls'].includes(ext)) {
    return <FileSpreadsheet className={`${className} text-emerald-400`} />;
  }
  if (['pdf', 'doc', 'docx', 'txt', 'md', 'rtf'].includes(ext) || contentType?.includes('pdf') || contentType?.includes('text')) {
    return <FileText className={`${className} text-blue-400`} />;
  }

  return <GenericFile className={`${className} text-slate-400`} />;
}
