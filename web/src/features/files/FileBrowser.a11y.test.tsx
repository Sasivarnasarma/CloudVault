import { act, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { FileBrowser } from './FileBrowser';
import type { ViewMode } from './browserTypes';

const folder = makeFolder('Reports');
const files = ['a.txt', 'b.txt', 'c.txt'].map((name) => makeFile(name));
const asEntries = (list: typeof files): Entry[] => [
  { type: 'folder', id: folder.prefix, name: folder.name, folder },
  ...list.map((file): Entry => ({ type: 'file', id: file.key, name: file.name, file })),
];

function renderBrowser(view: ViewMode, selected: string[] = [], list = files) {
  const props = {
    view,
    selection: new Set(selected),
    sort: { key: 'name' as const, dir: 'asc' as const },
    onSortChange: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onOpenFolder: vi.fn(),
    onChoose: vi.fn(),
    onToggleSelect: vi.fn(),
    onSelectRange: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onTransfer: vi.fn(),
    onDownloadZip: vi.fn(),
    onCut: vi.fn(),
    onCopy: vi.fn(),
    onPasteInto: vi.fn(),
    canPasteInto: vi.fn(() => false),
    onGoUp: vi.fn(),
    dragIds: null,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDropOnFolder: vi.fn(),
  };
  const ui = (items: Entry[]) => (
    <>
      <input aria-label="Search" />
      <FileBrowser {...props} entries={items} />
    </>
  );
  const utils = render(ui(asEntries(list)));
  return { ...utils, show: (next: typeof files) => utils.rerender(ui(asEntries(next))) };
}

const main = (name: string) =>
  document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;

describe('FileBrowser roles (grid view)', () => {
  it('is a list of items, each one saying whether it is selected', () => {
    renderBrowser('grid', ['a.txt', 'Reports/']);
    const list = screen.getByRole('list', { name: 'Files and folders' });
    expect(within(list).getAllByRole('listitem')).toHaveLength(4);
    expect(main('a.txt')).toHaveAttribute('aria-pressed', 'true');
    expect(main('Reports')).toHaveAttribute('aria-pressed', 'true'); // folders too
    expect(main('b.txt')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('FileBrowser roles (list view)', () => {
  it('is a multi-select grid whose rows say whether they are selected', () => {
    renderBrowser('list', ['b.txt']);
    const grid = screen.getByRole('grid', { name: 'Files and folders' });
    expect(grid).toHaveAttribute('aria-multiselectable', 'true');

    const rows = within(grid).getAllByRole('row');
    expect(rows).toHaveLength(5); // the header and four entries
    const row = (name: string) => rows.find((r) => r.querySelector(`[title="${name}"]`))!;
    expect(row('b.txt')).toHaveAttribute('aria-selected', 'true');
    expect(row('a.txt')).toHaveAttribute('aria-selected', 'false');
  });

  it('keeps the column headings sortable', () => {
    renderBrowser('list');
    expect(screen.getByRole('columnheader', { name: 'Name' })).toHaveAttribute('aria-sort', 'ascending');
    expect(screen.getByRole('columnheader', { name: 'Size' })).toHaveAttribute('aria-sort', 'none');
  });
});

describe.each(['grid', 'list'] as const)('keeping the keyboard focus in the list (%s view)', (view) => {
  const focus = (name: string) => act(() => main(name).focus());

  it('moves the focus to the item that takes the place of a deleted one', () => {
    const { show } = renderBrowser(view);
    focus('b.txt');
    expect(main('b.txt')).toHaveFocus();

    show(files.filter((f) => f.name !== 'b.txt'));
    expect(main('c.txt')).toHaveFocus();
  });

  it('moves it to the last item when the last one is deleted', () => {
    const { show } = renderBrowser(view);
    focus('c.txt');
    show(files.filter((f) => f.name !== 'c.txt'));
    expect(main('b.txt')).toHaveFocus();
  });

  it('does not take the focus when it was somewhere else', () => {
    const { show } = renderBrowser(view);
    focus('b.txt');
    act(() => screen.getByLabelText('Search').focus());
    show(files.filter((f) => f.name !== 'b.txt'));
    expect(screen.getByLabelText('Search')).toHaveFocus();
  });

  it('does not take the focus when it never was in the list', () => {
    const { show } = renderBrowser(view);
    show(files.filter((f) => f.name !== 'b.txt'));
    expect(document.body).toHaveFocus();
  });

  it('leaves the focus in a dialog that was opened from the list', () => {
    const { show } = renderBrowser(view);
    focus('b.txt');
    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    const button = document.createElement('button');
    dialog.append(button);
    document.body.append(dialog);
    act(() => button.focus());

    show(files.filter((f) => f.name !== 'b.txt'));
    expect(button).toHaveFocus();
    dialog.remove();
  });
});
