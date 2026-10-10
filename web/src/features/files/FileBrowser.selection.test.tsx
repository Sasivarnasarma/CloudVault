import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { FileBrowser, type ViewMode } from './FileBrowser';

const folder = makeFolder('Reports');
const a = makeFile('a.txt');
const b = makeFile('b.txt');
const entries: Entry[] = [
  { type: 'folder', id: folder.prefix, name: folder.name, folder },
  { type: 'file', id: a.key, name: a.name, file: a },
  { type: 'file', id: b.key, name: b.name, file: b },
];

function renderBrowser(view: ViewMode, selected: string[] = []) {
  const h = {
    onOpenFolder: vi.fn(),
    onToggleSelect: vi.fn(),
    onSelectRange: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onChoose: vi.fn(),
    onGoUp: vi.fn(),
    dragIds: null as string[] | null,
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
      {...h}
    />,
  );
  return h;
}

describe.each(['grid', 'list'] as const)('FileBrowser selection (%s view)', (view) => {
  it('has a checkbox per item that toggles it without opening anything', async () => {
    const h = renderBrowser(view);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select Reports' }));
    expect(h.onToggleSelect).toHaveBeenCalledWith('Reports/');
    expect(h.onOpenFolder).not.toHaveBeenCalled();

    await userEvent.click(screen.getByRole('checkbox', { name: 'Select a.txt' }));
    expect(h.onToggleSelect).toHaveBeenLastCalledWith('a.txt');
    expect(h.onChoose).not.toHaveBeenCalled();
  });

  it('reflects which items are selected', () => {
    renderBrowser(view, ['a.txt', 'Reports/']);
    expect(screen.getByRole('checkbox', { name: 'Select a.txt' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Select Reports' })).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByRole('checkbox', { name: 'Select b.txt' })).toHaveAttribute('aria-checked', 'false');
  });

  it('Ctrl/Cmd+click toggles and Shift+click selects a range, instead of opening or selecting alone', async () => {
    const h = renderBrowser(view);
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('Reports'));
    await user.click(screen.getByText('b.txt'));
    await user.keyboard('{/Control}');
    expect(h.onToggleSelect.mock.calls).toEqual([['Reports/'], ['b.txt']]);

    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('b.txt'));
    await user.keyboard('{/Shift}');
    expect(h.onSelectRange).toHaveBeenCalledWith('b.txt');
    expect(h.onOpenFolder).not.toHaveBeenCalled();
    expect(h.onChoose).not.toHaveBeenCalled();
  });

  it('selects an item alone on a plain click and only opens a folder on double click', async () => {
    const h = renderBrowser(view);
    await userEvent.click(screen.getByText('Reports'));
    expect(h.onChoose).toHaveBeenLastCalledWith('Reports/');
    expect(h.onOpenFolder).not.toHaveBeenCalled();
    await userEvent.click(screen.getByText('a.txt'));
    expect(h.onChoose).toHaveBeenLastCalledWith('a.txt');
    expect(h.onToggleSelect).not.toHaveBeenCalled();

    await userEvent.dblClick(screen.getByText('Reports'));
    expect(h.onOpenFolder).toHaveBeenCalledTimes(1);
  });

  it('does not open or download anything on a Ctrl/Shift double click', async () => {
    const h = renderBrowser(view);
    const user = userEvent.setup();
    await user.keyboard('{Control>}');
    await user.dblClick(screen.getByText('Reports'));
    await user.dblClick(screen.getByText('a.txt'));
    await user.keyboard('{/Control}');
    expect(h.onOpenFolder).not.toHaveBeenCalled();
    expect(h.onDownload).not.toHaveBeenCalled();
  });
});

describe('FileBrowser select all (list view)', () => {
  const header = () => screen.getByRole('checkbox', { name: 'Select all' });

  it('selects everything when nothing is selected', async () => {
    const h = renderBrowser('list');
    expect(header()).toHaveAttribute('aria-checked', 'false');
    await userEvent.click(header());
    expect(h.onSelectAll).toHaveBeenCalledTimes(1);
  });

  it('shows a mixed state for a partial selection and clears it on click', async () => {
    const h = renderBrowser('list', ['a.txt']);
    expect(header()).toHaveAttribute('aria-checked', 'mixed');
    await userEvent.click(header());
    expect(h.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('is checked when every row is selected and clears on click', async () => {
    const h = renderBrowser('list', ['Reports/', 'a.txt', 'b.txt']);
    expect(header()).toHaveAttribute('aria-checked', 'true');
    await userEvent.click(header());
    expect(h.onClearSelection).toHaveBeenCalledTimes(1);
  });

  it('is part of the table header', () => {
    renderBrowser('list');
    expect(within(screen.getAllByRole('row')[0]).getByRole('checkbox', { name: 'Select all' })).toBeInTheDocument();
  });
});
