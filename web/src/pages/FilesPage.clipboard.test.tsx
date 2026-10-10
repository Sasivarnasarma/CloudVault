import { installPageMocks, renderPage } from './filesPage.testkit';
import { act, screen, waitFor, within } from '@testing-library/react';
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
