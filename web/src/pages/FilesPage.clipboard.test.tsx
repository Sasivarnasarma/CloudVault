import { installPageMocks, renderPage } from './filesPage.testkit';
import { act, fireEvent, screen, waitFor, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFolder } from '../services/folderService';
import { ApiError } from '../services/http';
import { copyObject, moveObject } from '../services/objectService';

beforeEach(installPageMocks);

describe('FilesPage clipboard (Ctrl+C / Ctrl+X / Ctrl+V)', () => {
  const item = (name: string) =>
    document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;
  const row = (name: string) => item(name).closest('[data-entry-id]') as HTMLElement;
  const select = async (user: Awaited<ReturnType<typeof renderPage>>, ...names: string[]) => {
    act(() => item(names[0]).focus());
    await user.keyboard(' ');
    for (const name of names.slice(1)) {
      act(() => item(name).focus());
      await user.keyboard('{Control>} {/Control}');
    }
  };
  const openReports = async (user: Awaited<ReturnType<typeof renderPage>>) => {
    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText('q1.pdf');
  };

  it('copies a file into another folder with Ctrl+C and Ctrl+V', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}c{/Control}');
    expect(await screen.findByText('1 file copied')).toBeInTheDocument();

    await openReports(user);
    await user.keyboard('{Control>}v{/Control}');
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('notes.md', 'Reports/notes.md', false));
    expect(moveObject).not.toHaveBeenCalled();
    expect(await screen.findByText('Copied 1 file')).toBeInTheDocument();

    // The paste used the clipboard up.
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Clipboard' })).not.toBeInTheDocument());
    await user.keyboard('{Control>}v{/Control}');
    expect(copyObject).toHaveBeenCalledTimes(1);
  });

  it('keeps only the copies that failed on the clipboard', async () => {
    vi.mocked(copyObject).mockImplementation(async (source, destination) => {
      if (source === 'photo.png') throw new ApiError('A file with this name already exists', 409);
      return { success: true, source, destination };
    });
    const user = await renderPage();
    await select(user, 'notes.md', 'photo.png');
    await user.keyboard('{Control>}c{/Control}');
    await openReports(user);
    await user.keyboard('{Control>}v{/Control}');
    expect(await screen.findByText('Couldn’t copy 1 of 2 items')).toBeInTheDocument();
    expect(
      within(await screen.findByRole('region', { name: 'Clipboard' })).getByText('1 file copied'),
    ).toBeInTheDocument();
  });

  it('moves files with Ctrl+X and Ctrl+V, fading them until they are pasted, then forgets them', async () => {
    const user = await renderPage();
    await select(user, 'notes.md', 'photo.png');
    await user.keyboard('{Control>}x{/Control}');
    expect(await screen.findByText('2 files ready to move')).toBeInTheDocument();
    expect(row('notes.md')).toHaveClass('opacity-40');
    expect(row('report.pdf')).not.toHaveClass('opacity-40');

    await openReports(user);
    await user.keyboard('{Control>}v{/Control}');
    await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(2));
    expect(moveObject).toHaveBeenCalledWith('notes.md', 'Reports/notes.md', false);
    expect(moveObject).toHaveBeenCalledWith('photo.png', 'Reports/photo.png', false);
    expect(await screen.findByText('Moved 2 files')).toBeInTheDocument();

    await user.keyboard('{Control>}v{/Control}');
    expect(moveObject).toHaveBeenCalledTimes(2); // nothing left to paste
  });

  it('copies and moves folders too', async () => {
    const user = await renderPage();
    await select(user, 'Reports');
    await user.keyboard('{Control>}c{/Control}');
    await user.dblClick(screen.getByText('Photos'));
    await waitFor(() => expect(window.location.search).toBe('?p=Photos'));
    await user.keyboard('{Control>}v{/Control}');
    await waitFor(() => expect(copyFolder).toHaveBeenCalledWith('Reports/', 'Photos/Reports'));
  });

  it('names a copy pasted next to its original instead of failing', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}c{/Control}{Control>}v{/Control}');
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('notes.md', 'notes (copy).md', false));
    expect(copyObject).toHaveBeenCalledTimes(1);
  });

  it('does nothing when items that were cut are pasted into the folder they are in', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}x{/Control}{Control>}v{/Control}');
    await waitFor(() => expect(row('notes.md')).not.toHaveClass('opacity-40'));
    expect(moveObject).not.toHaveBeenCalled();
    expect(copyObject).not.toHaveBeenCalled();
  });

  it('keeps the items that could not be moved on the clipboard', async () => {
    vi.mocked(moveObject).mockImplementation(async (source, destination) => {
      if (source === 'photo.png') throw new ApiError('A file with this name already exists', 409);
      return { success: true, source, destination };
    });
    const user = await renderPage();
    await select(user, 'notes.md', 'photo.png');
    await user.keyboard('{Control>}x{/Control}');
    await openReports(user);
    await user.keyboard('{Control>}v{/Control}');
    expect(await screen.findByText('Couldn’t move 1 of 2 items')).toBeInTheDocument();

    await user.keyboard('{Backspace}');
    await screen.findByText('report.pdf');
    expect(row('photo.png')).toHaveClass('opacity-40');
    expect(row('notes.md')).not.toHaveClass('opacity-40');
  });

  it('forgets the clipboard with a second Escape, after the selection is cleared', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}x{/Control}');
    expect(row('notes.md')).toHaveClass('opacity-40');

    await user.keyboard('{Escape}');
    expect(screen.getByRole('checkbox', { name: 'Select notes.md' })).toHaveAttribute('aria-checked', 'false');
    expect(row('notes.md')).toHaveClass('opacity-40');
    await user.keyboard('{Escape}');
    expect(row('notes.md')).not.toHaveClass('opacity-40');
  });

  it('leaves Ctrl+C and Ctrl+V to the browser when there is nothing to copy or paste', async () => {
    const user = await renderPage();
    const keydown = (key: string) => {
      const event = new KeyboardEvent('keydown', { key, ctrlKey: true, bubbles: true, cancelable: true });
      act(() => void document.body.dispatchEvent(event));
      return event.defaultPrevented;
    };
    expect(keydown('c')).toBe(false);
    expect(keydown('x')).toBe(false);
    expect(keydown('v')).toBe(false);

    await select(user, 'notes.md');
    expect(keydown('c')).toBe(true);
    expect(keydown('v')).toBe(true);
  });

  it('does not take over Ctrl+C while text is selected on the page', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    const selection = vi.spyOn(window, 'getSelection').mockReturnValue({ toString: () => 'some text' } as Selection);
    await user.keyboard('{Control>}c{/Control}');
    selection.mockRestore();
    expect(screen.queryByText('1 file copied')).not.toBeInTheDocument();
  });
});

describe('FilesPage clipboard bar', () => {
  const item = (name: string) =>
    document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;
  const select = async (user: Awaited<ReturnType<typeof renderPage>>, name: string) => {
    act(() => item(name).focus());
    await user.keyboard(' ');
  };
  const bar = () => screen.queryByRole('region', { name: 'Clipboard' });

  it('appears after copying with a button that pastes into the folder being viewed', async () => {
    const user = await renderPage();
    expect(bar()).not.toBeInTheDocument();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}c{/Control}');
    expect(
      within(await screen.findByRole('region', { name: 'Clipboard' })).getByText('1 file copied'),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paste into All files/ })).toBeEnabled();

    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText('q1.pdf');
    await user.click(await screen.findByRole('button', { name: /Paste into Reports/ }));
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('notes.md', 'Reports/notes.md', false));
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
  });

  it('goes away after a cut has been pasted', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}x{/Control}');
    expect(await screen.findByText('1 file ready to move')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paste into All files/ })).toBeDisabled();
    expect(screen.getByText('Already in this folder')).toBeInTheDocument();

    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText('q1.pdf');
    await user.click(screen.getByRole('button', { name: /Paste into Reports/ }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('notes.md', 'Reports/notes.md', false));
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
  });

  it('can be dismissed with its close button', async () => {
    const user = await renderPage();
    await select(user, 'notes.md');
    await user.keyboard('{Control>}x{/Control}');
    await user.click(await screen.findByRole('button', { name: 'Clear clipboard' }));
    await waitFor(() => expect(bar()).not.toBeInTheDocument());
    expect(item('notes.md').closest('[data-entry-id]')).not.toHaveClass('opacity-40');
  });
});

describe('FilesPage clipboard from the right-click menu', () => {
  const rowOf = (name: string) =>
    document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-id]') as HTMLElement;
  const rightClick = (target: HTMLElement) => fireEvent.contextMenu(target);
  const menuItem = (name: string | RegExp) => screen.findByRole('menuitem', { name });

  it('copies a file from its menu and pastes it into a folder from that folder’s menu', async () => {
    const user = await renderPage();
    rightClick(rowOf('notes.md'));
    await user.click(await menuItem('Copy'));
    expect(await screen.findByText('1 file copied')).toBeInTheDocument();

    rightClick(rowOf('Reports'));
    await user.click(await menuItem('Paste into folder'));
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('notes.md', 'Reports/notes.md', false));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Clipboard' })).not.toBeInTheDocument());
  });

  it('cuts and moves with the same menus', async () => {
    const user = await renderPage();
    rightClick(rowOf('photo.png'));
    await user.click(await menuItem('Cut'));
    expect(await screen.findByText('1 file ready to move')).toBeInTheDocument();
    expect(rowOf('photo.png')).toHaveClass('opacity-40');

    rightClick(rowOf('Photos'));
    await user.click(await menuItem('Paste into folder'));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('photo.png', 'Photos/photo.png', false));
  });

  it('applies to the whole selection when the item is part of it', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('checkbox', { name: 'Select notes.md' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select photo.png' }));
    rightClick(rowOf('notes.md'));
    await user.click(await menuItem('Copy'));
    expect(await screen.findByText('2 files copied')).toBeInTheDocument();
  });

  it('applies only to the item when it is not part of the selection', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('checkbox', { name: 'Select notes.md' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select photo.png' }));
    rightClick(rowOf('report.pdf'));
    await user.click(await menuItem('Cut'));
    expect(await screen.findByText('1 file ready to move')).toBeInTheDocument();
  });

  it('disables paste in the menu of the empty space when the cut items are already in this folder', async () => {
    const user = await renderPage();
    rightClick(rowOf('notes.md'));
    await user.click(await menuItem('Cut'));
    await screen.findByText('1 file ready to move');

    rightClick(screen.getByRole('main'));
    expect(await menuItem('Paste')).toHaveAttribute('data-disabled');
    await user.keyboard('{Escape}');

    rightClick(rowOf('Reports'));
    expect(await menuItem('Paste into folder')).not.toHaveAttribute('data-disabled'); // another folder is fine
  });

  it('has a menu for the empty space with paste, new folder, upload and refresh', async () => {
    const user = await renderPage();
    rightClick(screen.getByRole('main'));
    expect(await menuItem('Paste')).toHaveAttribute('data-disabled'); // nothing to paste yet
    for (const name of ['New folder', 'Upload files', 'Upload folder', 'Refresh']) {
      expect(screen.getByRole('menuitem', { name })).toBeInTheDocument();
    }
    await user.click(screen.getByRole('menuitem', { name: 'New folder' }));
    expect(await screen.findByRole('dialog', { name: /folder/i })).toBeInTheDocument();
  });

  it('pastes into the folder being viewed from the menu of the empty space', async () => {
    const user = await renderPage();
    rightClick(rowOf('notes.md'));
    await user.click(await menuItem('Copy'));
    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText('q1.pdf');

    rightClick(screen.getByRole('main'));
    await user.click(await menuItem('Paste'));
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('notes.md', 'Reports/notes.md', false));
  });

  it('opens only the item’s menu when an item is right-clicked', async () => {
    await renderPage();
    rightClick(rowOf('notes.md'));
    await menuItem('Download');
    expect(screen.getAllByRole('menu')).toHaveLength(1);
    expect(screen.queryByRole('menuitem', { name: 'New folder' })).not.toBeInTheDocument();
  });
});
