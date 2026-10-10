import { Archive, Copy, Download, FolderInput, FolderOpen, Info, Pencil, Trash2 } from 'lucide-react';
import type { MouseEvent } from 'react';
import type { MenuItem } from '../../components/common/EntryMenu';
import type { Entry } from '../../lib/entries';
import type { EntryHandlers } from './browserTypes';

/** The right-click / "more" menu of an entry. */
export function menuFor(entry: Entry, h: EntryHandlers): MenuItem[] {
  const organize: MenuItem[] = [
    { label: 'Rename', icon: Pencil, separatorBefore: true, onSelect: () => h.onTransfer(entry, 'rename') },
    { label: 'Move to…', icon: FolderInput, onSelect: () => h.onTransfer(entry, 'move') },
    { label: 'Copy to…', icon: Copy, onSelect: () => h.onTransfer(entry, 'copy') },
  ];
  if (entry.type === 'folder') {
    return [
      { label: 'Open', icon: FolderOpen, onSelect: () => h.onOpenFolder(entry.folder.prefix) },
      { label: 'Download as zip', icon: Archive, onSelect: () => h.onDownloadZip([entry]) },
      ...organize,
      { label: 'Delete folder', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
    ];
  }
  return [
    { label: 'Details', icon: Info, onSelect: () => h.onChoose(entry.id) },
    { label: 'Download', icon: Download, onSelect: () => h.onDownload(entry.file.key, entry.name) },
    ...organize,
    { label: 'Delete', icon: Trash2, danger: true, separatorBefore: true, onSelect: () => h.onDelete(entry) },
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

/** Double-click opens a folder or downloads a file. */
export function handleDoubleClick(e: MouseEvent, entry: Entry, h: EntryHandlers) {
  if (e.shiftKey || e.ctrlKey || e.metaKey) return;
  if (entry.type === 'folder') h.onOpenFolder(entry.folder.prefix);
  else h.onDownload(entry.file.key, entry.name);
}
