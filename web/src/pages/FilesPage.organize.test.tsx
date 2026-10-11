import { installPageMocks, renderPage, listMock } from './filesPage.testkit';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { entryDragData, makeDataTransfer } from '../test/dataTransfer';
import { copyFolder, moveFolder } from '../services/folderService';
import { ApiError } from '../services/http';
import { copyObject, moveObject } from '../services/objectService';
import { FilesPage } from './FilesPage';

beforeEach(installPageMocks);

describe('FilesPage organize actions', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string, item: string) => {
    await user.click(screen.getByRole('button', { name: `More actions for ${name}` }));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  };

  it('renames a file from its menu and refreshes the listing', async () => {
    const user = await renderPage();
    await openMenu(user, 'report.pdf', 'Rename');

    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    const input = within(dialog).getByLabelText('Name');
    expect(input).toHaveValue('report.pdf');
    await user.clear(input);
    await user.type(input, 'final.pdf');

    const callsBefore = listMock.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('report.pdf', 'final.pdf', false));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves a file into another folder from the details panel', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    const details = await screen.findByRole('complementary', { name: 'File details' });
    await user.click(within(details).getByRole('button', { name: 'Move' }));

    const dialog = await screen.findByRole('dialog', { name: 'Move to…' });
    await user.click(await within(dialog).findByRole('button', { name: 'Reports' }));
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('Reports/')); // the picker lists without paging
    await user.click(within(dialog).getByRole('button', { name: 'Move here' }));

    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('report.pdf', 'Reports/report.pdf', false));
    // the moved file is no longer selected, so its details panel closes
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'File details' })).not.toBeInTheDocument());
  });

  it('copies a folder under a new name', async () => {
    const user = await renderPage();
    await openMenu(user, 'Reports', 'Copy to…');

    const dialog = await screen.findByRole('dialog', { name: 'Copy to…' });
    const input = within(dialog).getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'Reports backup');
    await user.click(within(dialog).getByRole('button', { name: 'Copy here' }));

    await waitFor(() => expect(copyFolder).toHaveBeenCalledWith('Reports/', 'Reports backup', expect.anything()));
  });

  it('copying keeps the original selected', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    const details = await screen.findByRole('complementary', { name: 'File details' });
    await user.click(within(details).getByRole('button', { name: 'Copy' }));

    const dialog = await screen.findByRole('dialog', { name: 'Copy to…' });
    const input = within(dialog).getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'report copy.pdf');
    await user.click(within(dialog).getByRole('button', { name: 'Copy here' }));

    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('report.pdf', 'report copy.pdf', false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('complementary', { name: 'File details' })).toBeInTheDocument();
  });

  it('offers to replace when the new name is already taken', async () => {
    vi.mocked(moveObject).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const user = await renderPage();
    await openMenu(user, 'report.pdf', 'Rename');

    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'notes.md');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already exists');
    await user.click(within(dialog).getByRole('button', { name: 'Replace existing file' }));
    await waitFor(() => expect(moveObject).toHaveBeenLastCalledWith('report.pdf', 'notes.md', true));
  });
});

describe('FilesPage drag and drop to move', () => {
  const tile = (name: string) => screen.getByText(name).closest('[draggable="true"]') as HTMLElement;
  const pathNav = () => screen.getByRole('navigation', { name: 'Folder path' });

  const startDrag = (name: string) => fireEvent.dragStart(tile(name), { dataTransfer: makeDataTransfer() });
  const dropOn = (target: HTMLElement) => {
    const dataTransfer = entryDragData();
    fireEvent.dragEnter(target, { dataTransfer });
    fireEvent.dragOver(target, { dataTransfer });
    fireEvent.drop(target, { dataTransfer });
  };

  it('moves a file into the folder it is dropped on', async () => {
    await renderPage();
    const callsBefore = listMock.mock.calls.length;
    startDrag('report.pdf');
    dropOn(tile('Reports'));

    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('report.pdf', 'Reports/report.pdf', false));
    expect(moveObject).toHaveBeenCalledTimes(1);
    expect(await screen.findByText('Moved 1 file')).toBeInTheDocument();
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('moves the whole selection when one of its items is dragged', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('checkbox', { name: 'Select report.pdf' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select notes.md' }));
    startDrag('notes.md');
    dropOn(tile('Photos'));

    await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(2));
    expect(moveObject).toHaveBeenCalledWith('report.pdf', 'Photos/report.pdf', false);
    expect(moveObject).toHaveBeenCalledWith('notes.md', 'Photos/notes.md', false);
    expect(await screen.findByText('Moved 2 files')).toBeInTheDocument();
  });

  it('moves a folder (and everything in it) into another folder', async () => {
    await renderPage();
    startDrag('Reports');
    dropOn(tile('Photos'));
    await waitFor(() => expect(moveFolder).toHaveBeenCalledWith('Reports/', 'Photos/Reports', expect.anything()));
  });

  it('moves items up a level when dropped on a folder in the path above the list', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    startDrag('q1.pdf');
    dropOn(within(pathNav()).getByRole('button', { name: 'All files' }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('Reports/q1.pdf', 'q1.pdf', false));
  });

  it('moves items to the parent folder when dropped on the up button', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    startDrag('q1.pdf');
    dropOn(screen.getByRole('button', { name: 'Up one folder' }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('Reports/q1.pdf', 'q1.pdf', false));
  });

  it('explains why an item could not be moved and leaves it selected', async () => {
    vi.mocked(moveObject).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    await renderPage();
    startDrag('report.pdf');
    dropOn(tile('Reports'));

    expect(await screen.findByText('Couldn’t move “report.pdf”')).toBeInTheDocument();
    expect(screen.getAllByText('A file with this name already exists').length).toBeGreaterThan(0);
    await waitFor(() =>
      expect(screen.getByRole('checkbox', { name: 'Select report.pdf' })).toHaveAttribute('aria-checked', 'true'),
    );
  });

  it('does nothing if the drag ends without a drop', async () => {
    await renderPage();
    startDrag('report.pdf');
    expect(tile('report.pdf')).toHaveClass('opacity-40');
    fireEvent.dragEnd(tile('report.pdf'), { dataTransfer: makeDataTransfer() });
    expect(tile('report.pdf')).not.toHaveClass('opacity-40');

    dropOn(tile('Reports')); // a stray drop afterwards is not ours to handle
    expect(moveObject).not.toHaveBeenCalled();
  });

  it('clears the dimming after a drop even if the dragged item disappears', async () => {
    await renderPage();
    startDrag('report.pdf');
    dropOn(tile('Reports'));
    await waitFor(() => expect(moveObject).toHaveBeenCalled());
    expect(tile('notes.md')).not.toHaveClass('opacity-40');
    expect(tile('Photos')).not.toHaveClass('ring-2');
  });

  it('does not treat moving items around as a file upload', async () => {
    await renderPage();
    startDrag('report.pdf');
    act(
      () =>
        void window.dispatchEvent(
          Object.assign(new Event('dragenter', { cancelable: true }), { dataTransfer: entryDragData() }),
        ),
    );
    expect(screen.queryByText('Drop to upload')).not.toBeInTheDocument();
  });
});

describe('FilesPage drag-move progress', () => {
  // The details panel can briefly show a file's name too, so look the item up among the draggable ones.
  const tile = (name: string) =>
    [...document.querySelectorAll<HTMLElement>('[draggable]')].find((el) => el.textContent?.includes(name))!;
  const dragOnto = (name: string, target: string) => {
    fireEvent.dragStart(tile(name), { dataTransfer: makeDataTransfer() });
    const dataTransfer = entryDragData();
    const folder = tile(target);
    fireEvent.dragEnter(folder, { dataTransfer });
    fireEvent.dragOver(folder, { dataTransfer });
    fireEvent.drop(folder, { dataTransfer });
  };

  it('shows a loading message and spinner until the move finishes, then replaces it with the result', async () => {
    let finish!: () => void;
    vi.mocked(moveObject).mockImplementation(
      (source, destination) =>
        new Promise((resolve) => {
          finish = () => resolve({ success: true, source, destination });
        }),
    );
    await renderPage();
    dragOnto('report.pdf', 'Reports');

    expect(await screen.findByText('Moving 1 file…')).toBeInTheDocument();
    expect(screen.getByRole('status', { name: 'Moving report.pdf' })).toBeInTheDocument();
    expect(tile('report.pdf')).toHaveAttribute('aria-busy', 'true');
    expect(screen.queryByText('Moved 1 file')).not.toBeInTheDocument();

    await act(async () => finish());
    expect((await screen.findAllByText('Moved 1 file')).length).toBeGreaterThan(0);
    await waitFor(() => expect(screen.queryByText('Moving 1 file…')).not.toBeInTheDocument()); // one toast, not two
    expect(screen.queryByRole('status', { name: 'Moving report.pdf' })).not.toBeInTheDocument();
  });

  it('turns the loading message into the error when the move fails', async () => {
    let fail!: () => void;
    vi.mocked(moveObject).mockImplementation(
      () =>
        new Promise((_resolve, reject) => {
          fail = () => reject(new ApiError('A file with this name already exists', 409));
        }),
    );
    await renderPage();
    dragOnto('report.pdf', 'Reports');
    expect(await screen.findByText('Moving 1 file…')).toBeInTheDocument();

    await act(async () => fail());
    expect(await screen.findByText('Couldn’t move “report.pdf”')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Moving 1 file…')).not.toBeInTheDocument());
    expect(screen.queryByRole('status', { name: 'Moving report.pdf' })).not.toBeInTheDocument();
  });

  it('shows both outcomes after a partial move and still removes the loading message', async () => {
    vi.mocked(moveObject).mockImplementation(async (source, destination) => {
      if (source === 'notes.md') throw new ApiError('A file with this name already exists', 409);
      return { success: true, source, destination };
    });
    const user = await renderPage();
    await user.click(screen.getByRole('checkbox', { name: 'Select report.pdf' }));
    await user.click(screen.getByRole('checkbox', { name: 'Select notes.md' }));
    dragOnto('report.pdf', 'Reports');

    expect(await screen.findByText('Moved 1 file')).toBeInTheDocument();
    expect(await screen.findByText('Couldn’t move 1 of 2 items')).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByText('Moving 2 files…')).not.toBeInTheDocument());
  });
});
