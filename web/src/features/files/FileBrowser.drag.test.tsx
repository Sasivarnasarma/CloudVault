import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ENTRY_DRAG_TYPE } from '../../lib/dragMove';
import type { Entry } from '../../lib/entries';
import { desktopFilesData, entryDragData, makeDataTransfer } from '../../test/dataTransfer';
import { makeFile, makeFolder } from '../../test/fixtures';
import { FileBrowser, type ViewMode } from './FileBrowser';

const photos = makeFolder('Photos');
const reports = makeFolder('Reports');
const a = makeFile('a.txt');
const b = makeFile('b.txt');
const entries: Entry[] = [
  { type: 'folder', id: photos.prefix, name: 'Photos', folder: photos },
  { type: 'folder', id: reports.prefix, name: 'Reports', folder: reports },
  { type: 'file', id: a.key, name: 'a.txt', file: a },
  { type: 'file', id: b.key, name: 'b.txt', file: b },
];

function renderBrowser(
  view: ViewMode,
  {
    selected = [],
    dragIds = null,
    busyIds = [],
  }: { selected?: string[]; dragIds?: string[] | null; busyIds?: string[] } = {},
) {
  const h = {
    onOpenFolder: vi.fn(),
    onToggleSelect: vi.fn(),
    onSelectRange: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onChoose: vi.fn(),
    onGoUp: vi.fn(),
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDropOnFolder: vi.fn(),
    onDownload: vi.fn(),
    onPreview: vi.fn(),
    onDelete: vi.fn(),
    onTransfer: vi.fn(),
    onDownloadZip: vi.fn(),
    onCut: vi.fn(),
    onCopy: vi.fn(),
    onPasteInto: vi.fn(),
    canPasteInto: vi.fn(() => false),
    onSortChange: vi.fn(),
  };
  render(
    <FileBrowser
      entries={entries}
      view={view}
      selection={new Set(selected)}
      sort={{ key: 'name', dir: 'asc' }}
      dragIds={dragIds}
      busyIds={busyIds}
      {...h}
    />,
  );
  return h;
}

/** The draggable element (tile or row) that contains this text. */
const item = (name: string) => screen.getByText(name).closest('[draggable="true"]') as HTMLElement;

describe.each(['grid', 'list'] as const)('FileBrowser drag and drop (%s view)', (view) => {
  it('makes every item draggable', () => {
    renderBrowser(view);
    for (const name of ['Photos', 'Reports', 'a.txt', 'b.txt']) expect(item(name)).toBeInTheDocument();
  });

  it('drags just the item you grab when it is not part of a selection', () => {
    const h = renderBrowser(view, { selected: ['b.txt'] });
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(item('a.txt'), { dataTransfer });
    expect(h.onDragStart).toHaveBeenCalledWith(['a.txt']);
    expect(JSON.parse(dataTransfer.getData(ENTRY_DRAG_TYPE))).toEqual(['a.txt']);
    expect(dataTransfer.effectAllowed).toBe('move');
  });

  it('drags the whole selection when you grab one of its items', () => {
    const h = renderBrowser(view, { selected: ['a.txt', 'Photos/'] });
    const dataTransfer = makeDataTransfer();
    fireEvent.dragStart(item('a.txt'), { dataTransfer });
    expect(h.onDragStart).toHaveBeenCalledWith(['a.txt', 'Photos/']);
    expect(JSON.parse(dataTransfer.getData(ENTRY_DRAG_TYPE))).toEqual(['a.txt', 'Photos/']);
  });

  it('reports when a drag ends', () => {
    const h = renderBrowser(view);
    fireEvent.dragEnd(item('a.txt'), { dataTransfer: makeDataTransfer() });
    expect(h.onDragEnd).toHaveBeenCalledTimes(1);
  });

  it('dims the items being dragged', () => {
    renderBrowser(view, { dragIds: ['a.txt'] });
    expect(item('a.txt')).toHaveClass('opacity-40');
    expect(item('b.txt')).not.toHaveClass('opacity-40');
  });

  it('lets a folder accept a drop and tells the page which folder', () => {
    const h = renderBrowser(view, { dragIds: ['a.txt'] });
    const dataTransfer = entryDragData();
    fireEvent.dragEnter(item('Reports'), { dataTransfer });
    expect(item('Reports').className).toMatch(/ring-2|outline-accent/); // highlighted as the drop target
    expect(fireEvent.dragOver(item('Reports'), { dataTransfer })).toBe(false);
    fireEvent.drop(item('Reports'), { dataTransfer });
    expect(h.onDropOnFolder).toHaveBeenCalledWith('Reports/');
  });

  it('does not accept drops on files, on the folder being dragged, or when nothing is being dragged', () => {
    const h = renderBrowser(view, { dragIds: ['Photos/'] });
    const dataTransfer = entryDragData();
    fireEvent.drop(item('b.txt'), { dataTransfer });
    fireEvent.drop(item('Photos'), { dataTransfer });
    expect(h.onDropOnFolder).not.toHaveBeenCalled();

    const idle = renderBrowser(view);
    fireEvent.drop(screen.getAllByText('Reports')[1].closest('[draggable="true"]')!, { dataTransfer });
    expect(idle.onDropOnFolder).not.toHaveBeenCalled();
  });

  it('shows a spinner on items that are being moved and stops them being dragged again', () => {
    renderBrowser(view, { busyIds: ['a.txt'] });
    expect(screen.getByRole('status', { name: 'Moving a.txt' })).toBeInTheDocument();
    const busy = screen.getByText('a.txt').closest('[aria-busy="true"]') as HTMLElement;
    expect(busy).toHaveClass('pointer-events-none');
    expect(busy).toHaveAttribute('draggable', 'false');
    expect(screen.queryByRole('status', { name: 'Moving b.txt' })).not.toBeInTheDocument();
    expect(item('b.txt')).not.toHaveAttribute('aria-busy');
  });

  it('ignores files dragged in from the desktop', () => {
    const h = renderBrowser(view, { dragIds: ['a.txt'] });
    const dataTransfer = desktopFilesData();
    expect(fireEvent.dragOver(item('Reports'), { dataTransfer })).toBe(true);
    fireEvent.drop(item('Reports'), { dataTransfer });
    expect(h.onDropOnFolder).not.toHaveBeenCalled();
  });
});
