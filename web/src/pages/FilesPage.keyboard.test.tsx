import { BATCH_ID, installPageMocks, renderPage, listMock } from './filesPage.testkit';
import { act, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchFolderTree } from '../services/folderService';
import { deleteObject, requestPresignedDownload } from '../services/objectService';
import { moveToTrash, restoreFromTrash } from '../services/trashService';
import { triggerBrowserDownload } from '../services/transferService';
import { FilesPage } from './FilesPage';

beforeEach(installPageMocks);

describe('FilesPage keyboard navigation', () => {
  const item = (name: string) =>
    document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;

  it('selects files with the arrow keys and shows the details of the one under the cursor', async () => {
    const user = await renderPage();
    item('Photos').focus();
    await user.keyboard('{ArrowDown}{ArrowDown}'); // Reports, notes.md
    expect(item('notes.md')).toHaveFocus();
    expect(await screen.findByRole('complementary', { name: 'File details' })).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Select notes.md' })).toHaveAttribute('aria-checked', 'true');

    await user.keyboard('{ArrowDown}');
    expect(item('photo.png')).toHaveFocus();
    expect(screen.getByRole('checkbox', { name: 'Select notes.md' })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('checkbox', { name: 'Select photo.png' })).toHaveAttribute('aria-checked', 'true');
  });

  it('keeps a file selected when Enter is pressed on it', async () => {
    const user = await renderPage();
    item('notes.md').focus();
    await user.keyboard('{ArrowDown}{ArrowUp}{Enter}');
    expect(screen.getByRole('checkbox', { name: 'Select notes.md' })).toHaveAttribute('aria-checked', 'true');
    await user.keyboard('{Enter}');
    expect(screen.getByRole('checkbox', { name: 'Select notes.md' })).toHaveAttribute('aria-checked', 'true');
  });

  it('opens a folder with Enter and goes back up with Backspace', async () => {
    const user = await renderPage();
    item('Reports').focus();
    await user.keyboard('{Enter}');
    expect(await screen.findByText('q1.pdf')).toBeInTheDocument();
    expect(window.location.search).toBe('?p=Reports');

    await user.keyboard('{Backspace}');
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('goes up a folder with Alt+Up, and Backspace does nothing at the top', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    const user = userEvent.setup();
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    await user.keyboard('{Alt>}{ArrowUp}{/Alt}');
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    await user.keyboard('{Backspace}');
    expect(window.location.search).toBe('');
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
  });

  it('does not navigate while typing in the search box', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    const user = userEvent.setup();
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    await user.type(screen.getByPlaceholderText(/search/i), 'ab{Backspace}{Backspace}');
    expect(window.location.search).toBe('?p=Reports');
    expect(screen.getByText('q1.pdf')).toBeInTheDocument();
  });

  it('lets the arrow keys and Delete work together: select with the arrows, trash with Delete', async () => {
    const user = await renderPage();
    item('Photos').focus();
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.keyboard('{Delete}');
    await waitFor(() => expect(moveToTrash).toHaveBeenCalledWith([{ path: 'notes.md', type: 'file' }]));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });
});

describe('FilesPage keyboard shortcuts', () => {
  const item = (name: string) =>
    document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;
  const select = async (user: Awaited<ReturnType<typeof renderPage>>, name: string) => {
    act(() => item(name).focus());
    await user.keyboard(' ');
  };

  it('renames the selected item with F2, and does nothing with no or several items selected', async () => {
    const user = await renderPage();
    await user.keyboard('{F2}');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    await select(user, 'notes.md');
    await user.keyboard('{F2}');
    expect(await screen.findByRole('dialog', { name: /Rename/ })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog', { name: /Rename/ })).not.toBeInTheDocument());

    await user.keyboard('{Control>}a{/Control}{F2}');
    expect(screen.queryByRole('dialog', { name: /Rename/ })).not.toBeInTheDocument();
  });

  it('downloads the selected file with Ctrl+D, and a folder as a zip', async () => {
    const picker = vi.fn(async () => ({ createWritable: async () => new WritableStream() }));
    (window as unknown as { showSaveFilePicker: unknown }).showSaveFilePicker = picker;
    const user = await renderPage();
    await select(user, 'Reports');
    await user.keyboard('{Control>}d{/Control}');
    await waitFor(() => expect(fetchFolderTree).toHaveBeenCalledWith('Reports/', expect.any(AbortSignal)));
    expect(picker).toHaveBeenCalledWith(expect.objectContaining({ suggestedName: 'Reports.zip' }));
    expect(requestPresignedDownload).not.toHaveBeenCalled();
    delete (window as unknown as { showSaveFilePicker?: unknown }).showSaveFilePicker;

    await select(user, 'report.pdf');
    await user.keyboard('{Control>}d{/Control}');
    await waitFor(() => expect(requestPresignedDownload).toHaveBeenCalledWith('report.pdf', 'report.pdf'));
    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith('https://storage.test/get'));
  });

  it('moves to the trash with Delete, and deletes for good with Shift+Delete after confirmation', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Shift>}{Delete}{/Shift}');
    expect(await screen.findByRole('dialog', { name: 'Delete file?' })).toBeInTheDocument();
    expect(deleteObject).not.toHaveBeenCalled();
    expect(moveToTrash).not.toHaveBeenCalled();
  });

  it('undoes the last delete with Ctrl+Z, once, and ignores Ctrl+Z when there is nothing to undo', async () => {
    const user = await renderPage();
    await user.keyboard('{Control>}z{/Control}');
    expect(restoreFromTrash).not.toHaveBeenCalled();

    await select(user, 'notes.md');
    await user.keyboard('{Delete}');
    await screen.findByText('Moved 1 file to the trash');
    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(restoreFromTrash).toHaveBeenCalledWith(BATCH_ID));
    await user.keyboard('{Control>}z{/Control}');
    expect(restoreFromTrash).toHaveBeenCalledTimes(1);
  });

  it('opens the new folder dialog with Alt+N', async () => {
    const user = await renderPage();
    await user.keyboard('{Alt>}n{/Alt}');
    expect(await screen.findByRole('dialog', { name: /folder/i })).toBeInTheDocument();
  });

  it('opens the file and folder pickers with Ctrl+U and Ctrl+Shift+U', async () => {
    const user = await renderPage();
    const clicks: string[] = [];
    const spy = vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(function (this: HTMLInputElement) {
      clicks.push(this.getAttribute('aria-label') ?? 'files');
    });
    await user.keyboard('{Control>}u{/Control}');
    await user.keyboard('{Control>}{Shift>}U{/Shift}{/Control}');
    spy.mockRestore();
    expect(clicks).toEqual(['files', 'Upload folder']);
  });

  it('refreshes the listing with F5 instead of reloading the page', async () => {
    const user = await renderPage();
    const before = listMock.mock.calls.length;
    await user.keyboard('{F5}');
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(before));
    await user.keyboard('{Control>}r{/Control}');
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(before + 1));
  });

  it('focuses the search box with / and Ctrl+E', async () => {
    const user = await renderPage();
    const search = screen.getByPlaceholderText('Search this folder');
    await user.keyboard('/');
    expect(search).toHaveFocus();
    expect(search).toHaveValue('');
    act(() => search.blur());
    await user.keyboard('{Control>}e{/Control}');
    expect(search).toHaveFocus();
  });

  it('opens the menu of the focused item with Shift+F10 and the Menu key', async () => {
    const user = await renderPage();
    act(() => item('notes.md').focus());
    await user.keyboard('{Shift>}{F10}{/Shift}');
    expect(await screen.findByRole('menuitem', { name: 'Rename' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('menuitem', { name: 'Rename' })).not.toBeInTheDocument());

    await user.keyboard('{ContextMenu}');
    expect(await screen.findByRole('menuitem', { name: 'Download' })).toBeInTheDocument();
  });

  it('leaves the shortcuts alone while typing in a field or with a dialog open', async () => {
    const user = await renderPage();
    await user.click(screen.getByPlaceholderText('Search this folder'));
    await user.keyboard('{Alt>}n{/Alt}{Control>}u{/Control}?');
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();

    act(() => (document.activeElement as HTMLElement).blur());
    await user.keyboard('{Alt>}n{/Alt}');
    await screen.findByRole('dialog');
    await user.keyboard('?');
    expect(screen.queryByRole('dialog', { name: 'Keyboard shortcuts' })).not.toBeInTheDocument();
  });

  it('shows every shortcut in a dialog opened with ? or from the sidebar', async () => {
    const user = await renderPage();
    await user.keyboard('?');
    const dialog = await screen.findByRole('dialog', { name: 'Keyboard shortcuts' });
    for (const group of ['Move around', 'Select', 'Work with items', 'Upload and view']) {
      expect(within(dialog).getByRole('region', { name: group })).toBeInTheDocument();
    }
    expect(within(dialog).getByText('Rename')).toBeInTheDocument();
    expect(within(dialog).getByText('F2')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    await user.click(screen.getAllByRole('button', { name: 'Keyboard shortcuts' })[0]);
    expect(await screen.findByRole('dialog', { name: 'Keyboard shortcuts' })).toBeInTheDocument();
  });
});
