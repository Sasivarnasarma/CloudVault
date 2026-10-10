import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { FileBrowser, type ViewMode } from './FileBrowser';

const folder = makeFolder('Reports');
const files = ['a.txt', 'b.txt', 'bar.txt', 'cat.txt', 'dog.txt', 'emu.txt'].map((name) => makeFile(name));
const asEntries = (list: typeof files): Entry[] => [
  { type: 'folder', id: folder.prefix, name: folder.name, folder },
  ...list.map((file): Entry => ({ type: 'file', id: file.key, name: file.name, file })),
];
// Order shown: Reports, a, b, bar, cat, dog, emu (7 items)
const entries = asEntries(files);

function makeHandlers() {
  return {
    onOpenFolder: vi.fn(),
    onToggleSelect: vi.fn(),
    onSelectRange: vi.fn(),
    onSelectAll: vi.fn(),
    onClearSelection: vi.fn(),
    onChoose: vi.fn(),
    onGoUp: vi.fn(),
    onReachEnd: vi.fn(),
    dragIds: null as string[] | null,
    onDragStart: vi.fn(),
    onDragEnd: vi.fn(),
    onDropOnFolder: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onTransfer: vi.fn(),
    onSortChange: vi.fn(),
  };
}

function renderBrowser(view: ViewMode, list: Entry[] = entries) {
  const h = makeHandlers();
  const ui = (items: Entry[]) => (
    <>
      <input aria-label="Search" />
      <FileBrowser entries={items} view={view} selection={new Set()} sort={{ key: 'name', dir: 'asc' }} {...h} />
    </>
  );
  const utils = render(ui(list));
  return { h, ...utils, rerenderWith: (items: Entry[]) => utils.rerender(ui(items)) };
}

const main = (name: string) => screen.getByText(name).closest('[data-entry-main]') as HTMLElement;
const focusItem = (name: string) => act(() => main(name).focus());
const tabStops = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLElement>('[data-entry-main]'))
    .filter((el) => el.tabIndex === 0)
    .map((el) => el.closest<HTMLElement>('[data-entry-id]')?.dataset.entryId);

afterEach(() => vi.restoreAllMocks());

/** jsdom has no layout, so pretend the grid is laid out in two columns. */
function mockGridColumns(count: number) {
  const real = window.getComputedStyle.bind(window);
  vi.spyOn(window, 'getComputedStyle').mockImplementation((el: Element, pseudo?: string | null) =>
    el.classList.contains('grid')
      ? ({ gridTemplateColumns: Array(count).fill('100px').join(' '), overflowY: 'visible' } as CSSStyleDeclaration)
      : real(el, pseudo),
  );
}

describe.each(['list', 'grid'] as const)('keyboard navigation (%s view)', (view) => {
  it('makes only the cursor item a tab stop, starting with the first', () => {
    const { container } = renderBrowser(view);
    expect(tabStops(container)).toEqual(['Reports/']);
  });

  it('moves the cursor and selects the item it lands on with up / down', async () => {
    mockGridColumns(1);
    const { h, container } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('a.txt');

    await user.keyboard('{ArrowDown}');
    expect(h.onChoose).toHaveBeenLastCalledWith('b.txt');
    expect(main('b.txt')).toHaveFocus();
    expect(tabStops(container)).toEqual(['b.txt']);

    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(h.onChoose).toHaveBeenLastCalledWith('Reports/');
    expect(main('Reports')).toHaveFocus();
    expect(tabStops(container)).toEqual(['Reports/']);
  });

  it('stops at the first and last item instead of wrapping', async () => {
    mockGridColumns(1);
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('Reports');
    await user.keyboard('{ArrowUp}');
    expect(main('Reports')).toHaveFocus();

    focusItem('emu.txt');
    await user.keyboard('{ArrowDown}');
    expect(main('emu.txt')).toHaveFocus();
    expect(h.onChoose).toHaveBeenLastCalledWith('emu.txt');
  });

  it('jumps to the ends with Home / End and by a page with PageDown / PageUp', async () => {
    mockGridColumns(1);
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('bar.txt');

    await user.keyboard('{End}');
    expect(main('emu.txt')).toHaveFocus();
    await user.keyboard('{Home}');
    expect(main('Reports')).toHaveFocus();
    await user.keyboard('{PageDown}'); // fewer items than a page
    expect(main('emu.txt')).toHaveFocus();
    await user.keyboard('{PageUp}');
    expect(main('Reports')).toHaveFocus();
    expect(h.onChoose).toHaveBeenCalledTimes(4);
  });

  it('asks for the next page when the cursor reaches the last loaded item', async () => {
    mockGridColumns(1);
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('dog.txt');
    await user.keyboard('{ArrowDown}');
    expect(h.onReachEnd).toHaveBeenCalledTimes(1);
    focusItem('cat.txt');
    await user.keyboard('{ArrowDown}');
    expect(h.onReachEnd).toHaveBeenCalledTimes(1);
  });

  it('jumps to the item whose name starts with the typed letters, cycling on repeats', async () => {
    mockGridColumns(1);
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('Reports');

    await user.keyboard('d');
    expect(main('dog.txt')).toHaveFocus();
    expect(h.onChoose).toHaveBeenLastCalledWith('dog.txt');

    await user.keyboard('{Escape}'); // not a navigation key: nothing happens
    await new Promise((r) => setTimeout(r, 850)); // let the typed text expire
    await user.keyboard('b');
    expect(main('b.txt')).toHaveFocus();
    await user.keyboard('b'); // same letter again: next name starting with b
    expect(main('bar.txt')).toHaveFocus();
    await user.keyboard('b');
    expect(main('b.txt')).toHaveFocus();

    await new Promise((r) => setTimeout(r, 850));
    await user.keyboard('ba');
    expect(main('bar.txt')).toHaveFocus();
  });

  it('opens a folder with Enter, and for a file selects it for its details without toggling it off', async () => {
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('Reports');
    await user.keyboard('{Enter}');
    expect(h.onOpenFolder).toHaveBeenCalledWith('Reports/');

    focusItem('a.txt');
    await user.keyboard('{Enter}');
    expect(h.onChoose).toHaveBeenLastCalledWith('a.txt');
  });

  it('works when nothing is focused: the first key lands on the first item, End on the last', async () => {
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    await user.keyboard('{ArrowDown}');
    expect(h.onChoose).toHaveBeenLastCalledWith('Reports/');
    expect(main('Reports')).toHaveFocus();

    (document.activeElement as HTMLElement).blur();
    await user.keyboard('{ArrowDown}'); // the cursor is remembered now
    expect(h.onChoose).toHaveBeenLastCalledWith('a.txt');
  });

  it('follows the item that was focused with the mouse', async () => {
    mockGridColumns(1);
    const { h, container } = renderBrowser(view);
    const user = userEvent.setup();
    await user.click(screen.getByText('cat.txt'));
    expect(tabStops(container)).toEqual(['cat.txt']);
    await user.keyboard('{ArrowDown}');
    expect(h.onChoose).toHaveBeenLastCalledWith('dog.txt');
  });

  it('ignores the keys while typing in a field, with a dialog open, or with modifiers held', async () => {
    const { h } = renderBrowser(view);
    const user = userEvent.setup();

    await user.click(screen.getByLabelText('Search'));
    await user.keyboard('{ArrowDown}{End}abc');
    expect(h.onChoose).not.toHaveBeenCalled();

    focusItem('a.txt');
    await user.keyboard('{Alt>}{ArrowDown}{/Alt}');
    await user.keyboard('{Control>}d{/Control}');
    await user.keyboard('{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}');
    expect(main('a.txt')).toHaveFocus();
    expect(h.onChoose).not.toHaveBeenCalled();
    expect(h.onSelectRange).not.toHaveBeenCalled();

    const dialog = document.createElement('div');
    dialog.setAttribute('role', 'dialog');
    document.body.append(dialog);
    await user.keyboard('{ArrowDown}');
    dialog.remove();
    expect(h.onChoose).not.toHaveBeenCalled();
  });

  it('keeps the cursor at the same place when the item under it disappears', async () => {
    const { container, rerenderWith } = renderBrowser(view);
    focusItem('bar.txt'); // index 3
    expect(tabStops(container)).toEqual(['bar.txt']);

    rerenderWith(asEntries(files.filter((f) => f.name !== 'bar.txt')));
    expect(tabStops(container)).toEqual(['cat.txt']);

    rerenderWith(asEntries(files.filter((f) => f.name === 'a.txt')));
    expect(tabStops(container)).toEqual(['a.txt']);
  });

  it('does nothing in an empty list', async () => {
    const { h } = renderBrowser(view, []);
    await userEvent.setup().keyboard('{ArrowDown}');
    expect(h.onChoose).not.toHaveBeenCalled();
  });
});

describe('keyboard navigation (list view)', () => {
  it('goes up a folder with the left arrow and into the folder under the cursor with the right arrow', async () => {
    const { h } = renderBrowser('list');
    const user = userEvent.setup();
    focusItem('Reports');
    await user.keyboard('{ArrowRight}');
    expect(h.onOpenFolder).toHaveBeenCalledWith('Reports/');

    focusItem('a.txt');
    await user.keyboard('{ArrowRight}');
    expect(h.onOpenFolder).toHaveBeenCalledTimes(1); // a file has nothing to open

    await user.keyboard('{ArrowLeft}');
    expect(h.onGoUp).toHaveBeenCalledTimes(1);
  });
});

describe('keyboard navigation (grid view)', () => {
  it('moves by rows with up / down and by item with left / right', async () => {
    mockGridColumns(3);
    const { h } = renderBrowser('grid');
    const user = userEvent.setup();
    focusItem('a.txt'); // index 1 of: Reports a b | bar cat dog | emu

    await user.keyboard('{ArrowDown}');
    expect(main('cat.txt')).toHaveFocus();
    await user.keyboard('{ArrowRight}');
    expect(main('dog.txt')).toHaveFocus();
    await user.keyboard('{ArrowDown}'); // short last row: lands on the last item
    expect(main('emu.txt')).toHaveFocus();
    await user.keyboard('{ArrowLeft}');
    expect(main('dog.txt')).toHaveFocus();
    await user.keyboard('{ArrowUp}{ArrowUp}');
    expect(main('b.txt')).toHaveFocus();
    expect(h.onGoUp).not.toHaveBeenCalled();
    expect(h.onOpenFolder).not.toHaveBeenCalled();
  });
});

describe.each(['list', 'grid'] as const)('keyboard selection (%s view)', (view) => {
  it('extends the selection from the cursor with Shift + arrows, Home / End', async () => {
    mockGridColumns(1);
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('a.txt');

    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(h.onSelectRange).toHaveBeenLastCalledWith('b.txt', 'a.txt');
    expect(main('b.txt')).toHaveFocus();
    await user.keyboard('{Shift>}{End}{/Shift}');
    expect(h.onSelectRange).toHaveBeenLastCalledWith('emu.txt', 'b.txt');
    await user.keyboard('{Shift>}{Home}{/Shift}');
    expect(h.onSelectRange).toHaveBeenLastCalledWith('Reports/', 'emu.txt');
    expect(h.onChoose).not.toHaveBeenCalled();
  });

  it('moves the cursor without changing the selection while Ctrl is held', async () => {
    mockGridColumns(1);
    const { h, container } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('a.txt');

    await user.keyboard('{Control>}{ArrowDown}{ArrowDown}{/Control}');
    expect(main('bar.txt')).toHaveFocus();
    expect(tabStops(container)).toEqual(['bar.txt']);
    await user.keyboard('{Control>}{End}{/Control}');
    expect(main('emu.txt')).toHaveFocus();
    expect(h.onChoose).not.toHaveBeenCalled();
    expect(h.onSelectRange).not.toHaveBeenCalled();
    expect(h.onToggleSelect).not.toHaveBeenCalled();
  });

  it('selects the item under the cursor with Space and toggles it with Ctrl+Space', async () => {
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    focusItem('b.txt');

    await user.keyboard(' ');
    expect(h.onChoose).toHaveBeenCalledTimes(1);
    expect(h.onChoose).toHaveBeenCalledWith('b.txt');

    await user.keyboard('{Control>} {/Control}');
    expect(h.onToggleSelect).toHaveBeenCalledTimes(1);
    expect(h.onToggleSelect).toHaveBeenCalledWith('b.txt');
    expect(h.onChoose).toHaveBeenCalledTimes(1); // the button's own click did not run as well
  });

  it('ignores Space when no item has the focus, and Shift+Space', async () => {
    const { h } = renderBrowser(view);
    const user = userEvent.setup();
    await user.keyboard(' ');
    focusItem('b.txt');
    await user.keyboard('{Shift>} {/Shift}');
    expect(h.onChoose).not.toHaveBeenCalled();
    expect(h.onToggleSelect).not.toHaveBeenCalled();
  });
});

describe('keyboard selection (list view)', () => {
  it('leaves Shift / Ctrl + left / right alone, since plain left / right navigate folders', async () => {
    const { h } = renderBrowser('list');
    const user = userEvent.setup();
    focusItem('Reports');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}{Control>}{ArrowLeft}{/Control}');
    expect(h.onOpenFolder).not.toHaveBeenCalled();
    expect(h.onGoUp).not.toHaveBeenCalled();
    expect(h.onSelectRange).not.toHaveBeenCalled();
  });
});

describe('keyboard selection (grid view)', () => {
  it('extends left / right and by rows with Shift', async () => {
    mockGridColumns(3);
    const { h } = renderBrowser('grid');
    const user = userEvent.setup();
    focusItem('a.txt');
    await user.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(h.onSelectRange).toHaveBeenLastCalledWith('b.txt', 'a.txt');
    await user.keyboard('{Shift>}{ArrowDown}{/Shift}');
    expect(h.onSelectRange).toHaveBeenLastCalledWith('dog.txt', 'b.txt');
  });
});
