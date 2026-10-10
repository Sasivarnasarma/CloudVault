import {
  Archive,
  ClipboardPaste,
  Copy,
  CopyPlus,
  Download,
  FolderInput,
  Eye,
  FolderOpen,
  Info,
  Pencil,
  Scissors,
  Trash2,
} from 'lucide-react';
import type { MouseEvent } from 'react';
import type { MenuItem } from '../../components/common/EntryMenu';
import type { Entry } from '../../lib/entries';
import { canPreview } from '../../lib/previewKind';
import type { EntryHandlers } from './browserTypes';

/** The right-click / "more" menu of an entry. */
export function menuFor(entry: Entry, h: EntryHandlers): MenuItem[] {
  const clipboard: MenuItem[] = [
    { label: 'Cut', icon: Scissors, separatorBefore: true, onSelect: () => h.onCut(entry) },
    { label: 'Copy', icon: Copy, onSelect: () => h.onCopy(entry) },
  ];
  const organize: MenuItem[] = [
    { label: 'Rename', icon: Pencil, separatorBefore: true, onSelect: () => h.onTransfer(entry, 'rename') },
    { label: 'Move to…', icon: FolderInput, onSelect: () => h.onTransfer(entry, 'move') },
    { label: 'Copy to…', icon: CopyPlus, onSelect: () => h.onTransfer(entry, 'copy') },
  ];
  if (entry.type === 'folder') {
    return [
      { label: 'Open', icon: FolderOpen, onSelect: () => h.onOpenFolder(entry.folder.prefix) },
      { label: 'Download as zip', icon: Archive, onSelect: () => h.onDownloadZip([entry]) },
      ...clipboard,
      {
        label: 'Paste into folder',
        icon: ClipboardPaste,
        disabled: !h.canPasteInto(entry.folder.prefix),
        onSelect: () => h.onPasteInto(entry.folder.prefix),
      },
      ...organize,
      { label: 'Move to trash', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
    ];
  }
  return [
    ...(canPreview(entry.file) ? [{ label: 'Preview', icon: Eye, onSelect: () => h.onPreview(entry.file) }] : []),
    { label: 'Details', icon: Info, onSelect: () => h.onChoose(entry.id) },
    { label: 'Download', icon: Download, onSelect: () => h.onDownload(entry.file.key, entry.name) },
    ...clipboard,
    ...organize,
    { label: 'Move to trash', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
  ];
}

/** Touch screens have no double-click, so there a tap on a folder opens it. */
const tapOpensFolders = () => window.matchMedia?.('(pointer: coarse)').matches ?? false;

/** Click on an entry, like a desktop file manager: modifiers extend the selection, otherwise select it. */
export function handleClick(e: MouseEvent, entry: Entry, h: EntryHandlers) {
  if (e.shiftKey) h.onSelectRange(entry.id);
  else if (e.ctrlKey || e.metaKey) h.onToggleSelect(entry.id);
  else if (entry.type === 'folder' && tapOpensFolders()) h.onOpenFolder(entry.folder.prefix);
  else h.onChoose(entry.id);
}

/** Double-click opens a folder, previews a file the browser can show, or downloads any other. */
export function handleDoubleClick(e: MouseEvent, entry: Entry, h: EntryHandlers) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) return;
  if (entry.type === 'folder') h.onOpenFolder(entry.folder.prefix);
  else if (canPreview(entry.file)) h.onPreview(entry.file);
  else h.onDownload(entry.file.key, entry.name);
}
