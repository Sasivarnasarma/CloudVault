import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry, TransferMode } from '../../lib/entries';
import { ApiError } from '../../services/http';
import { makeFile, makeFolder, makeListing } from '../../test/fixtures';
import { TransferDialog } from './TransferDialog';

vi.mock('../../services/objectService', () => ({ listObjects: vi.fn(), copyObject: vi.fn(), moveObject: vi.fn() }));
vi.mock('../../services/folderService', () => ({ copyFolder: vi.fn(), moveFolder: vi.fn() }));
import { copyFolder, moveFolder } from '../../services/folderService';
import { copyObject, listObjects, moveObject } from '../../services/objectService';

const file: Entry = { type: 'file', id: 'docs/a.txt', name: 'a.txt', file: makeFile('docs/a.txt', { name: 'a.txt' }) };
const folderEntry: Entry = { type: 'folder', id: 'docs/old/', name: 'old', folder: makeFolder('old', 'docs/') };

const TREE: Record<string, ReturnType<typeof makeListing>> = {
  '': makeListing('', [makeFolder('docs'), makeFolder('archive')]),
  'docs/': makeListing('docs/', [makeFolder('old', 'docs/'), makeFolder('new', 'docs/')]),
  'archive/': makeListing('archive/', []),
};

function setup(entry: Entry, mode: TransferMode, startPrefix = 'docs/') {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<TransferDialog target={{ entry, mode }} startPrefix={startPrefix} onClose={onClose} onDone={onDone} />);
  return { onClose, onDone, user: userEvent.setup() };
}

const nameInput = () => screen.getByLabelText('Name');
const submitButton = (name: string) => screen.getByRole('button', { name });

beforeEach(() => {
  vi.mocked(listObjects)
    .mockReset()
    .mockImplementation(async (prefix = '') => TREE[prefix] ?? makeListing(prefix));
  vi.mocked(moveObject).mockReset().mockResolvedValue({ success: true, source: '', destination: '' });
  vi.mocked(copyObject).mockReset().mockResolvedValue({ success: true, source: '', destination: '' });
  vi.mocked(moveFolder).mockReset().mockResolvedValue({ success: true, source: '', destination: '', item_count: 3 });
  vi.mocked(copyFolder).mockReset().mockResolvedValue({ success: true, source: '', destination: '', item_count: 3 });
});

describe('TransferDialog', () => {
  it('renders nothing without a target', () => {
    render(<TransferDialog target={null} startPrefix="" onClose={() => {}} onDone={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  describe('rename', () => {
    it('prefills the current name and only enables Rename once it changes', async () => {
      const { user } = setup(file, 'rename');
      expect(screen.getByRole('dialog', { name: 'Rename' })).toBeInTheDocument();
      expect(nameInput()).toHaveValue('a.txt');
      expect(submitButton('Rename')).toBeDisabled();
      expect(screen.getByText('Enter a different name.')).toBeInTheDocument();

      await user.clear(nameInput());
      await user.type(nameInput(), 'b.txt');
      expect(submitButton('Rename')).toBeEnabled();
      expect(screen.getByText('Result: docs/b.txt')).toBeInTheDocument();
    });

    it('renames a file within its folder', async () => {
      const { user, onDone, onClose } = setup(file, 'rename');
      await user.clear(nameInput());
      await user.type(nameInput(), 'b.txt');
      await user.click(submitButton('Rename'));

      await waitFor(() => expect(moveObject).toHaveBeenCalledWith('docs/a.txt', 'docs/b.txt', false));
      expect(onDone).toHaveBeenCalledWith({ mode: 'rename', entry: file, destination: 'docs/b.txt' });
      expect(onClose).toHaveBeenCalled();
      expect(listObjects).not.toHaveBeenCalled(); // no folder picker when renaming
    });

    it('renames a folder', async () => {
      const { user } = setup(folderEntry, 'rename');
      await user.clear(nameInput());
      await user.type(nameInput(), 'renamed{Enter}');
      await waitFor(() => expect(moveFolder).toHaveBeenCalledWith('docs/old/', 'docs/renamed'));
    });

    it.each(['a/b', 'a\\b', '..', '   '])('blocks the invalid name %j', async (value) => {
      const { user } = setup(file, 'rename');
      await user.clear(nameInput());
      await user.type(nameInput(), value);
      expect(submitButton('Rename')).toBeDisabled();
      expect(moveObject).not.toHaveBeenCalled();
    });
  });

  describe('move and copy', () => {
    it('browses folders and moves the file into the chosen one', async () => {
      const { user, onDone } = setup(file, 'move', 'docs/');
      expect(screen.getByRole('dialog', { name: 'Move to…' })).toBeInTheDocument();
      expect(await screen.findByRole('button', { name: 'new' })).toBeInTheDocument();

      await user.click(screen.getByRole('navigation', { name: 'Folder path' }).querySelector('button')!);
      await user.click(await screen.findByRole('button', { name: 'archive' }));
      await waitFor(() => expect(listObjects).toHaveBeenLastCalledWith('archive/'));

      expect(screen.getByText('Result: archive/a.txt')).toBeInTheDocument();
      await user.click(submitButton('Move here'));
      await waitFor(() => expect(moveObject).toHaveBeenCalledWith('docs/a.txt', 'archive/a.txt', false));
      expect(onDone).toHaveBeenCalledWith({ mode: 'move', entry: file, destination: 'archive/a.txt' });
    });

    it('will not copy onto itself, but can copy under a new name', async () => {
      const { user } = setup(file, 'copy', 'docs/');
      expect(submitButton('Copy here')).toBeDisabled();
      expect(screen.getByText('Choose a different folder or name.')).toBeInTheDocument();

      await user.clear(nameInput());
      await user.type(nameInput(), 'a copy.txt');
      await user.click(submitButton('Copy here'));
      await waitFor(() => expect(copyObject).toHaveBeenCalledWith('docs/a.txt', 'docs/a copy.txt', false));
    });

    it('hides the folder being moved from the picker', async () => {
      setup(folderEntry, 'move', 'docs/');
      expect(await screen.findByRole('button', { name: 'new' })).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'old' })).not.toBeInTheDocument();
    });

    it('refuses to move or copy a folder into itself', async () => {
      const { user } = setup(
        { ...folderEntry, folder: makeFolder('docs'), id: 'docs/', name: 'docs' },
        'copy',
        'docs/',
      );
      expect(await screen.findByText('A folder can’t be moved or copied into itself.')).toBeInTheDocument();
      expect(submitButton('Copy here')).toBeDisabled();
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(copyFolder).not.toHaveBeenCalled();
    });

    it('copies a folder to a new location', async () => {
      const { user, onDone } = setup(folderEntry, 'copy', 'archive/');
      await user.click(submitButton('Copy here'));
      await waitFor(() => expect(copyFolder).toHaveBeenCalledWith('docs/old/', 'archive/old'));
      expect(onDone).toHaveBeenCalledWith({ mode: 'copy', entry: folderEntry, destination: 'archive/old/' });
    });

    it('shows picker errors', async () => {
      vi.mocked(listObjects).mockRejectedValue(new Error('Storage service is unavailable'));
      setup(file, 'move', 'docs/');
      expect(await screen.findByText('Storage service is unavailable')).toBeInTheDocument();
    });
  });

  describe('conflicts and errors', () => {
    it('offers to replace an existing file, then retries with overwrite', async () => {
      vi.mocked(moveObject).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
      const { user, onDone } = setup(file, 'rename');
      await user.clear(nameInput());
      await user.type(nameInput(), 'taken.txt');
      await user.click(submitButton('Rename'));

      expect(await screen.findByRole('alert')).toHaveTextContent('A file with this name already exists');
      expect(onDone).not.toHaveBeenCalled();

      await user.click(screen.getByRole('button', { name: 'Replace existing file' }));
      await waitFor(() => expect(moveObject).toHaveBeenLastCalledWith('docs/a.txt', 'docs/taken.txt', true));
      expect(onDone).toHaveBeenCalled();
    });

    it('never offers to replace an existing folder', async () => {
      vi.mocked(moveFolder).mockRejectedValueOnce(new ApiError('A folder with this name already exists', 409));
      const { user } = setup(folderEntry, 'rename');
      await user.clear(nameInput());
      await user.type(nameInput(), 'new');
      await user.click(submitButton('Rename'));

      expect(await screen.findByRole('alert')).toHaveTextContent('A folder with this name already exists');
      expect(screen.queryByRole('button', { name: 'Replace existing file' })).not.toBeInTheDocument();
    });

    it('shows other failures without a replace option and keeps the dialog open', async () => {
      vi.mocked(copyObject).mockRejectedValueOnce(new ApiError('Storage service is unavailable', 503));
      const { user, onClose } = setup(file, 'copy', 'archive/');
      await user.click(submitButton('Copy here'));

      expect(await screen.findByRole('alert')).toHaveTextContent('Storage service is unavailable');
      expect(screen.queryByRole('button', { name: 'Replace existing file' })).not.toBeInTheDocument();
      expect(onClose).not.toHaveBeenCalled();
    });

    it('clears the error when the name is edited', async () => {
      vi.mocked(moveObject).mockRejectedValueOnce(new ApiError('boom', 500));
      const { user } = setup(file, 'rename');
      await user.type(nameInput(), 'x');
      await user.click(submitButton('Rename'));
      expect(await screen.findByRole('alert')).toBeInTheDocument();
      await user.type(nameInput(), 'y');
      expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    });

    it('closes with Cancel', async () => {
      const { user, onClose } = setup(file, 'rename');
      await user.click(screen.getByRole('button', { name: 'Cancel' }));
      expect(onClose).toHaveBeenCalled();
    });
  });
});
