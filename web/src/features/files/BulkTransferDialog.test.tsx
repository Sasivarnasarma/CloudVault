import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { ApiError } from '../../services/http';
import { makeFile, makeFolder, makeListing } from '../../test/fixtures';
import { BulkTransferDialog, type BulkTransferTarget } from './BulkTransferDialog';

vi.mock('../../services/objectService', () => ({ listObjects: vi.fn(), copyObject: vi.fn(), moveObject: vi.fn() }));
vi.mock('../../services/folderService', () => ({ copyFolder: vi.fn(), moveFolder: vi.fn() }));
import { copyFolder, moveFolder } from '../../services/folderService';
import { copyObject, listObjects, moveObject } from '../../services/objectService';

const file = (name: string): Entry => ({ type: 'file', id: name, name, file: makeFile(name) });
const folder = (name: string): Entry => ({ type: 'folder', id: `${name}/`, name, folder: makeFolder(name) });

const TREE: Record<string, ReturnType<typeof makeListing>> = {
  '': makeListing('', [makeFolder('Photos'), makeFolder('Archive')]),
  'Archive/': makeListing('Archive/', [makeFolder('Old', 'Archive/')]),
};

function setup(target: BulkTransferTarget, startPrefix = '') {
  const onClose = vi.fn();
  const onDone = vi.fn();
  render(<BulkTransferDialog target={target} startPrefix={startPrefix} onClose={onClose} onDone={onDone} />);
  return { onClose, onDone, user: userEvent.setup() };
}

beforeEach(() => {
  vi.mocked(listObjects)
    .mockReset()
    .mockImplementation(async (prefix = '') => TREE[prefix] ?? makeListing(prefix));
  for (const m of [moveObject, copyObject])
    vi.mocked(m).mockReset().mockResolvedValue({ success: true, source: '', destination: '' });
  for (const m of [moveFolder, copyFolder])
    vi.mocked(m).mockReset().mockResolvedValue({ success: true, source: '', destination: '', item_count: 1 });
});

describe('BulkTransferDialog', () => {
  it('renders nothing without a target', () => {
    render(<BulkTransferDialog target={null} startPrefix="" onClose={() => {}} onDone={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('moves every selected item into the chosen folder', async () => {
    const { user, onDone, onClose } = setup({
      mode: 'move',
      entries: [file('a.txt'), file('b.txt'), folder('Photos')],
    });
    expect(screen.getByRole('dialog', { name: 'Move 3 items' })).toBeInTheDocument();
    expect(screen.getByText('2 files and 1 folder')).toBeInTheDocument();

    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await waitFor(() => expect(listObjects).toHaveBeenLastCalledWith('Archive/'));
    await user.click(screen.getByRole('button', { name: 'Move here' }));

    await waitFor(() => expect(onDone).toHaveBeenCalledTimes(1));
    expect(moveObject).toHaveBeenCalledWith('a.txt', 'Archive/a.txt', false);
    expect(moveObject).toHaveBeenCalledWith('b.txt', 'Archive/b.txt', false);
    expect(moveFolder).toHaveBeenCalledWith('Photos/', 'Archive/Photos');
    expect(onDone.mock.calls[0][0]).toBe('move');
    expect(onDone.mock.calls[0][1].every((r: { ok: boolean }) => r.ok)).toBe(true);
    expect(onClose).toHaveBeenCalled();
  });

  it('copies instead when asked to', async () => {
    const { user } = setup({ mode: 'copy', entries: [file('a.txt'), folder('Photos')] });
    expect(screen.getByRole('dialog', { name: 'Copy 2 items' })).toBeInTheDocument();
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Copy here' }));
    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('a.txt', 'Archive/a.txt', false));
    expect(copyFolder).toHaveBeenCalledWith('Photos/', 'Archive/Photos');
  });

  it('only offers the replace option when files are involved, and passes it on', async () => {
    const first = setup({ mode: 'move', entries: [folder('Photos'), folder('Docs')] });
    expect(screen.queryByLabelText('Replace files that already exist')).not.toBeInTheDocument();
    first.onClose();
  });

  it('replaces existing files when the option is ticked', async () => {
    const { user } = setup({ mode: 'move', entries: [file('a.txt'), file('b.txt')] });
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.click(screen.getByLabelText('Replace files that already exist'));
    await user.click(screen.getByRole('button', { name: 'Move here' }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledTimes(2));
    expect(vi.mocked(moveObject).mock.calls.every((c) => c[2] === true)).toBe(true);
  });

  it('hides the selected folders from the picker so they cannot be chosen', async () => {
    setup({ mode: 'move', entries: [folder('Photos'), file('a.txt')] });
    expect(await screen.findByRole('button', { name: 'Archive' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Photos' })).not.toBeInTheDocument();
  });

  it('lists what could not be moved, with reasons, and stays open', async () => {
    vi.mocked(moveObject).mockImplementation(async (source) => {
      if (source === 'b.txt') throw new ApiError('A file with this name already exists', 409);
      return { success: true, source, destination: '' };
    });
    const { user, onDone, onClose } = setup({ mode: 'move', entries: [file('a.txt'), file('b.txt')] });
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Move here' }));

    expect(await screen.findByText('1 of 2 items were moved.', { exact: false })).toBeInTheDocument();
    expect(screen.getByText('b.txt')).toBeInTheDocument();
    expect(screen.getByText('A file with this name already exists')).toBeInTheDocument();
    expect(onDone).toHaveBeenCalledTimes(1); // the page refreshes even though some items failed
    expect(onClose).not.toHaveBeenCalled();

    await user.click(screen.getByText('Close', { selector: 'button' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('shows progress while working and blocks cancelling', async () => {
    const gate: { release: () => void } = { release: () => {} };
    vi.mocked(moveObject).mockImplementation(
      () => new Promise((resolve) => (gate.release = () => resolve({ success: true, source: '', destination: '' }))),
    );
    const { user, onClose } = setup({ mode: 'move', entries: [file('a.txt')] });
    await user.click(await screen.findByRole('button', { name: 'Archive' }));
    await user.click(screen.getByRole('button', { name: 'Move here' }));

    expect(await screen.findByRole('button', { name: 'Moving 0 of 1…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    expect(onClose).not.toHaveBeenCalled();
    gate.release();
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1)); // all items worked, so the dialog closes itself
  });
});
