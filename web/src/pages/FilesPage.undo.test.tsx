import { installPageMocks, renderPage } from './filesPage.testkit';
import { act, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFolder, deleteFolder, moveFolder } from '../services/folderService';
import { ApiError } from '../services/http';
import { copyObject, deleteObject, moveObject } from '../services/objectService';

beforeEach(installPageMocks);

type User = Awaited<ReturnType<typeof renderPage>>;

const item = (name: string) =>
  document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;

async function select(user: User, name: string) {
  act(() => item(name).focus());
  await user.keyboard(' ');
}

/** Cut or copy the selected item, open Photos and paste it there. */
async function pasteIntoPhotos(user: User, key: 'c' | 'x') {
  await user.keyboard(`{Control>}${key}{/Control}`);
  await user.dblClick(screen.getByText('Photos'));
  await waitFor(() => expect(window.location.search).toBe('?p=Photos'));
  await user.keyboard('{Control>}v{/Control}');
}

describe('FilesPage: undoing moves, copies and renames', () => {
  it('puts a pasted (cut) file back from the toast', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await pasteIntoPhotos(user, 'x');
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('notes.md', 'Photos/notes.md', false));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(moveObject).toHaveBeenLastCalledWith('Photos/notes.md', 'notes.md', false));
    expect(await screen.findByText('Moved 1 item back')).toBeInTheDocument();
  });

  it('puts a moved folder back, too', async () => {
    const user = await renderPage();
    await select(user, 'Reports');
    await pasteIntoPhotos(user, 'x');
    await waitFor(() => expect(moveFolder).toHaveBeenCalledWith('Reports/', 'Photos/Reports', expect.anything()));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    await waitFor(() => expect(moveFolder).toHaveBeenLastCalledWith('Photos/Reports/', 'Reports'));
  });

  it('removes the copies when a paste (copy) is undone with Ctrl+Z', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await pasteIntoPhotos(user, 'c');
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('notes.md', 'Photos/notes.md', false));
    await screen.findByText('Copied 1 file');

    await user.keyboard('{Control>}z{/Control}');

    await waitFor(() => expect(deleteObject).toHaveBeenCalledWith('Photos/notes.md'));
    expect(await screen.findByText('Removed the copy')).toBeInTheDocument();
    expect(moveObject).not.toHaveBeenCalled(); // the original was never touched
  });

  it('removes a copied folder', async () => {
    const user = await renderPage();
    await select(user, 'Reports');
    await pasteIntoPhotos(user, 'c');
    await waitFor(() => expect(copyFolder).toHaveBeenCalled());
    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith('Photos/Reports/'));
  });

  it('undoes one change after another with Ctrl+Z, latest first', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}x{/Control}');
    await user.dblClick(screen.getByText('Photos'));
    await waitFor(() => expect(window.location.search).toBe('?p=Photos'));
    await user.keyboard('{Control>}v{/Control}');
    await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(1));

    await user.keyboard('{Control>}z{/Control}');
    await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(2));
    expect(moveObject).toHaveBeenLastCalledWith('Photos/notes.md', 'notes.md', false);

    // Nothing else to undo.
    await user.keyboard('{Control>}z{/Control}');
    expect(moveObject).toHaveBeenCalledTimes(2);
  });

  it('says what could not be put back, for example because the old place is taken again', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await pasteIntoPhotos(user, 'x');
    await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(1));
    vi.mocked(moveObject).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));

    expect(await screen.findByText('Couldn’t undo one item')).toBeInTheDocument();
    expect(screen.getByText('A file with this name already exists')).toBeInTheDocument();
  });

  it('undoes a rename from the dialog', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'More actions for report.pdf' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Rename' }));
    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    const input = within(dialog).getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'final.pdf');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('report.pdf', 'final.pdf', false));

    await user.click(await screen.findByRole('button', { name: 'Undo' }));
    await waitFor(() => expect(moveObject).toHaveBeenLastCalledWith('final.pdf', 'report.pdf', false));
  });

  it('does not offer to undo a copy that replaced a file', async () => {
    // Replacing is only possible from the dialog after a conflict; undoing would delete the original.
    const { transferEntry } = await import('../features/files/bulkActions');
    const file = { type: 'file' as const, id: 'a.txt', name: 'a.txt', file: { key: 'a.txt' } as never };
    expect(await transferEntry(file, 'copy', 'b/', true)).toBeNull();
    expect(await transferEntry(file, 'copy', 'b/', false)).toEqual({ type: 'file', from: 'a.txt', to: 'b/a.txt' });
  });
});
