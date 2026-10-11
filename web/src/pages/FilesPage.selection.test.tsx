import { BATCH_ID, installPageMocks, renderPage, listMock } from './filesPage.testkit';
import { act, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFolder, deleteFolder } from '../services/folderService';
import { ApiError } from '../services/http';
import { copyObject, deleteObject, moveObject } from '../services/objectService';
import { moveToTrash } from '../services/trashService';

beforeEach(installPageMocks);

describe('FilesPage multi-select and bulk actions', () => {
  const check = (user: ReturnType<typeof userEvent.setup>, name: string) =>
    user.click(screen.getByRole('checkbox', { name: `Select ${name}` }));
  const isChecked = (name: string) =>
    screen.getByRole('checkbox', { name: `Select ${name}` }).getAttribute('aria-checked');

  it('shows a bulk bar for several items and hides the details panel', async () => {
    const user = await renderPage();
    await check(user, 'report.pdf');
    expect(await screen.findByRole('complementary', { name: 'File details' })).toBeInTheDocument(); // one file: details
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();

    await check(user, 'photo.png');
    const bar = await screen.findByRole('toolbar', { name: 'Actions for selected items' });
    expect(within(bar).getByText('2 selected')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'File details' })).not.toBeInTheDocument());
  });

  it('shows the bulk bar for a single selected folder', async () => {
    const user = await renderPage();
    await check(user, 'Reports');
    expect(await screen.findByText('1 selected')).toBeInTheDocument();
    expect(screen.getByText('(1 folder)')).toBeInTheDocument();
  });

  it('supports Ctrl+click and Shift+click ranges', async () => {
    const user = await renderPage();
    await user.keyboard('{Control>}');
    await user.click(screen.getByText('report.pdf'));
    await user.click(screen.getByText('notes.md'));
    await user.keyboard('{/Control}');
    expect(isChecked('report.pdf')).toBe('true');
    expect(isChecked('notes.md')).toBe('true');
    expect(isChecked('photo.png')).toBe('false');

    await user.click(screen.getByRole('button', { name: 'Clear selection' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select Reports' })); // anchor: first item
    await user.keyboard('{Shift>}');
    await user.click(screen.getByText('photo.png'));
    await user.keyboard('{/Shift}');
    // order shown: folders first (Photos, Reports), then files alphabetically (notes.md, photo.png, report.pdf)
    expect(['Reports', 'notes.md', 'photo.png'].map(isChecked)).toEqual(['true', 'true', 'true']);
    expect(isChecked('report.pdf')).toBe('false');
  });

  it('selects everything with Ctrl+A and clears with Escape', async () => {
    const user = await renderPage();
    await user.keyboard('{Control>}a{/Control}');
    expect(await screen.findByText('5 selected')).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('selects all rows from the list view header checkbox', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'List view' }));
    await user.click(await screen.findByRole('checkbox', { name: 'Select all' }));
    expect(await screen.findByText('5 selected')).toBeInTheDocument();
    await user.click(screen.getByRole('checkbox', { name: 'Select all' }));
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('forgets the selection when you open another folder', async () => {
    const user = await renderPage();
    await check(user, 'report.pdf');
    await check(user, 'notes.md');
    expect(await screen.findByText('2 selected')).toBeInTheDocument();
    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText('q1.pdf');
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
  });

  it('drops hidden items from the selection when the search narrows the list', async () => {
    const user = await renderPage();
    await check(user, 'report.pdf');
    await check(user, 'notes.md');
    await screen.findByText('2 selected');
    await user.type(screen.getByRole('searchbox'), 'notes');
    await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument()); // only notes.md is left selected
    expect(await screen.findByRole('complementary', { name: 'File details' })).toBeInTheDocument();
  });

  describe('bulk delete (to the trash)', () => {
    it('moves every selected file and folder to the trash in one go', async () => {
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await check(user, 'Reports');
      const callsBefore = listMock.mock.calls.length;
      await user.click(await screen.findByRole('button', { name: 'Move to trash' }));

      await waitFor(() => expect(moveToTrash).toHaveBeenCalledTimes(1));
      expect(vi.mocked(moveToTrash).mock.calls[0][0]).toEqual(
        expect.arrayContaining([
          { path: 'report.pdf', type: 'file' },
          { path: 'notes.md', type: 'file' },
          { path: 'Reports/', type: 'folder' },
        ]),
      );
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(await screen.findByText('Moved 2 files and 1 folder to the trash')).toBeInTheDocument();
      await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
      await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
    });

    it('keeps the items that could not be moved selected and reports them', async () => {
      vi.mocked(moveToTrash).mockImplementation(async (items) => ({
        batch: {
          id: BATCH_ID,
          deleted_at: '2026-01-01T00:00:00Z',
          total_size: 1,
          roots: items.filter((i) => i.path !== 'notes.md').map((i) => ({ ...i, size: 1, item_count: 1 })),
        },
        failed: [{ path: 'notes.md', error: 'Storage service is unavailable' }],
      }));
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await user.click(await screen.findByRole('button', { name: 'Move to trash' }));

      expect(await screen.findByText('Couldn’t move 1 of 2 items to the trash')).toBeInTheDocument();
      expect(screen.getByText('Storage service is unavailable')).toBeInTheDocument();
      expect(await screen.findByText('Moved 1 file to the trash')).toBeInTheDocument();
      await waitFor(() => expect(isChecked('notes.md')).toBe('true'));
    });

    it('does the same from the Delete key, but not while typing', async () => {
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await user.type(screen.getByRole('searchbox'), '{Delete}');
      expect(moveToTrash).not.toHaveBeenCalled();

      await user.click(document.body);
      await user.keyboard('{Delete}');
      await waitFor(() => expect(moveToTrash).toHaveBeenCalledTimes(1));
      expect(await screen.findByText('Moved 2 files to the trash')).toBeInTheDocument();
    });

    it('deletes for good, after confirmation, with Shift+Delete', async () => {
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await check(user, 'Reports');
      await user.click(document.body);
      await user.keyboard('{Shift>}{Delete}{/Shift}');

      const dialog = await screen.findByRole('dialog', { name: 'Delete 3 items?' });
      expect(dialog).toHaveTextContent('2 files and 1 folder');
      expect(dialog).toHaveTextContent('including everything inside the folders');
      expect(deleteObject).not.toHaveBeenCalled();
      expect(moveToTrash).not.toHaveBeenCalled();

      await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
      await waitFor(() => expect(deleteObject).toHaveBeenCalledTimes(2));
      expect(deleteObject).toHaveBeenCalledWith('report.pdf');
      expect(deleteObject).toHaveBeenCalledWith('notes.md');
      expect(deleteFolder).toHaveBeenCalledWith('Reports/');
    });

    it('does nothing when the permanent delete is cancelled', async () => {
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await user.click(document.body);
      await user.keyboard('{Shift>}{Delete}{/Shift}');
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
      expect(deleteObject).not.toHaveBeenCalled();
      expect(screen.getByText('2 selected')).toBeInTheDocument();
    });

    it('keeps the items that failed a permanent delete selected and reports them', async () => {
      vi.mocked(deleteObject).mockImplementation(async (key) => {
        if (key === 'notes.md') throw new Error('Storage service is unavailable');
        return { success: true, key, message: '' };
      });
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await user.click(document.body);
      await user.keyboard('{Shift>}{Delete}{/Shift}');
      await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

      await waitFor(() => expect(deleteObject).toHaveBeenCalledTimes(2));
      expect(await screen.findByText('Couldn’t delete 1 of 2 items')).toBeInTheDocument();
      expect(screen.getByText('Storage service is unavailable')).toBeInTheDocument();
      await waitFor(() => expect(isChecked('notes.md')).toBe('true'));
    });
  });

  describe('bulk move and copy', () => {
    it('moves the selected items into a folder chosen in the picker', async () => {
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await user.click(await screen.findByRole('button', { name: 'Move to…' }));

      const dialog = await screen.findByRole('dialog', { name: 'Move 2 items' });
      await user.click(await within(dialog).findByRole('button', { name: 'Photos' }));
      await user.click(within(dialog).getByRole('button', { name: 'Move here' }));

      await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(2));
      expect(moveObject).toHaveBeenCalledWith('report.pdf', 'Photos/report.pdf', false);
      expect(moveObject).toHaveBeenCalledWith('notes.md', 'Photos/notes.md', false);
      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
      await waitFor(() => expect(screen.queryByRole('toolbar')).not.toBeInTheDocument());
    });

    it('copies a mix of files and folders', async () => {
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'Reports');
      await user.click(await screen.findByRole('button', { name: 'Copy to…' }));

      const dialog = await screen.findByRole('dialog', { name: 'Copy 2 items' });
      await user.click(await within(dialog).findByRole('button', { name: 'Photos' }));
      await user.click(within(dialog).getByRole('button', { name: 'Copy here' }));

      await waitFor(() => expect(copyObject).toHaveBeenCalledWith('report.pdf', 'Photos/report.pdf', false));
      expect(copyFolder).toHaveBeenCalledWith('Reports/', 'Photos/Reports', expect.anything());
    });

    it('keeps the failed items selected after a partial move', async () => {
      vi.mocked(moveObject).mockImplementation(async (source, destination) => {
        if (source === 'notes.md') throw new ApiError('A file with this name already exists', 409);
        return { success: true, source, destination };
      });
      const user = await renderPage();
      await check(user, 'report.pdf');
      await check(user, 'notes.md');
      await user.click(await screen.findByRole('button', { name: 'Move to…' }));
      const dialog = await screen.findByRole('dialog', { name: 'Move 2 items' });
      await user.click(await within(dialog).findByRole('button', { name: 'Photos' }));
      await user.click(within(dialog).getByRole('button', { name: 'Move here' }));

      expect(await within(dialog).findByText('A file with this name already exists')).toBeInTheDocument();
      await user.click(within(dialog).getByText('Close', { selector: 'button' }));
      await waitFor(() => expect(isChecked('notes.md')).toBe('true'));
    });
  });
});

describe('FilesPage keyboard selection', () => {
  const item = (name: string) =>
    document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;
  const checked = (name: string) =>
    screen.getByRole('checkbox', { name: `Select ${name}` }).getAttribute('aria-checked') === 'true';

  it('extends the selection with Shift + arrows and shows the bulk bar', async () => {
    const user = await renderPage();
    act(() => item('Photos').focus());
    await user.keyboard('{Shift>}{ArrowDown}{ArrowDown}{/Shift}'); // Photos, Reports, notes.md
    expect(['Photos', 'Reports', 'notes.md'].map(checked)).toEqual([true, true, true]);
    expect(checked('photo.png')).toBe(false);
    expect(await screen.findByText('3 selected')).toBeInTheDocument();

    await user.keyboard('{Shift>}{ArrowUp}{/Shift}');
    expect(checked('notes.md')).toBe(false);
    expect(checked('Reports')).toBe(true);
  });

  it('builds a selection of separate items with Ctrl+arrows and Ctrl+Space', async () => {
    const user = await renderPage();
    act(() => item('Photos').focus());
    await user.keyboard('{Control>} {/Control}'); // Photos
    await user.keyboard('{Control>}{ArrowDown}{ArrowDown}{/Control}'); // cursor on notes.md, nothing else changes
    expect(item('notes.md')).toHaveFocus();
    expect(checked('Reports')).toBe(false);
    await user.keyboard('{Control>} {/Control}');
    expect(['Photos', 'notes.md'].map(checked)).toEqual([true, true]);
    expect(checked('Reports')).toBe(false);

    await user.keyboard('{Control>} {/Control}'); // toggle notes.md off again
    expect(checked('notes.md')).toBe(false);
    expect(checked('Photos')).toBe(true);
  });

  it('inverts the selection with Ctrl+I', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('checkbox', { name: 'Select report.pdf' }));
    await user.keyboard('{Control>}i{/Control}');
    expect(checked('report.pdf')).toBe(false);
    expect(['Photos', 'Reports', 'notes.md', 'photo.png'].every(checked)).toBe(true);
    await user.keyboard('{Control>}i{/Control}');
    expect(['Photos', 'Reports', 'notes.md', 'photo.png'].some(checked)).toBe(false);
  });

  it('does not invert while typing in the search box', async () => {
    const user = await renderPage();
    await user.click(screen.getByPlaceholderText('Search this folder'));
    await user.keyboard('{Control>}i{/Control}');
    expect(['Photos', 'Reports', 'notes.md', 'photo.png', 'report.pdf'].some(checked)).toBe(false);
  });
});
