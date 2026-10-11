import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { TrashBatch } from '../../types';
import { AppToaster } from '../../components/layout/AppToaster';
import { TrashView } from './TrashView';

vi.mock('../../services/trashService', () => ({
  listTrash: vi.fn(),
  restoreFromTrash: vi.fn(),
  deleteFromTrash: vi.fn(),
  emptyTrash: vi.fn(),
  moveToTrash: vi.fn(),
}));
import { deleteFromTrash, emptyTrash, listTrash, restoreFromTrash } from '../../services/trashService';

const list = vi.mocked(listTrash);

const recent = new Date(Date.now() - 2 * 3600 * 1000).toISOString();
const BATCH_A: TrashBatch = {
  id: '20260101T000000Z-aaaaaa',
  deleted_at: recent,
  total_size: 3072,
  roots: [
    { path: 'docs/report.pdf', type: 'file', size: 2048, item_count: 1 },
    { path: 'photos/', type: 'folder', size: 1024, item_count: 3 },
  ],
};
const BATCH_B: TrashBatch = {
  id: '20260101T000000Z-bbbbbb',
  deleted_at: '2025-01-05T10:00:00Z',
  total_size: 10,
  roots: [{ path: 'notes.md', type: 'file', size: 10, item_count: 1 }],
};

beforeEach(() => {
  list.mockReset().mockResolvedValue({ batches: [BATCH_A, BATCH_B], total_size: 3082 });
  vi.mocked(restoreFromTrash)
    .mockReset()
    .mockResolvedValue({ restored: ['x'], failed: [] });
  vi.mocked(deleteFromTrash).mockReset().mockResolvedValue({ deleted_count: 2 });
  vi.mocked(emptyTrash).mockReset().mockResolvedValue({ deleted_count: 5 });
});

function setup() {
  const h = { onRestored: vi.fn(), onOpenNav: vi.fn() };
  render(
    <>
      <TrashView {...h} />
      <AppToaster theme="light" />
    </>,
  );
  return { ...h, user: userEvent.setup() };
}

const card = (id: string) =>
  within(screen.getByRole('list', { name: 'Deleted items' })).getAllByRole('listitem', { name: /^Deleted / })[
    id === 'a' ? 0 : 1
  ];

describe('TrashView', () => {
  it('shows what was deleted, when, and where each item came from', async () => {
    setup();
    expect(await screen.findByRole('heading', { name: 'Trash' })).toBeInTheDocument();
    expect(await screen.findByText('3 items · 3 KB')).toBeInTheDocument();

    const first = card('a');
    expect(within(first).getByText(/Deleted 2 hours ago/)).toBeInTheDocument();
    expect(within(first).getByText('report.pdf')).toBeInTheDocument();
    expect(within(first).getByText('docs/')).toBeInTheDocument(); // the folder it was in
    expect(within(first).getByText('3 files · 1 KB')).toBeInTheDocument(); // the deleted folder
    expect(within(card('b')).getByText('notes.md')).toBeInTheDocument();
  });

  it('shows a placeholder while loading', () => {
    list.mockReturnValue(new Promise(() => {}));
    setup();
    expect(screen.getByRole('status', { name: 'Loading files' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeDisabled();
  });

  it('says so when the trash is empty and has nothing to empty', async () => {
    list.mockResolvedValue({ batches: [], total_size: 0 });
    setup();
    expect(await screen.findByText('The trash is empty')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Empty trash' })).toBeDisabled();
  });

  it('shows an error with a way to try again', async () => {
    list.mockRejectedValueOnce(new Error('Storage is down'));
    const { user } = setup();
    expect(await screen.findByText('Unable to load the trash')).toBeInTheDocument();
    expect(screen.getByText('Storage is down')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('3 items · 3 KB')).toBeInTheDocument();
  });

  it('restores a batch, tells the page and shows the trash as it is now', async () => {
    const { user, onRestored } = setup();
    await screen.findByText('3 items · 3 KB');
    list.mockResolvedValue({ batches: [BATCH_B], total_size: 10 });

    await user.click(within(card('a')).getByRole('button', { name: 'Restore' }));

    await waitFor(() => expect(restoreFromTrash).toHaveBeenCalledWith(BATCH_A.id));
    expect(await screen.findByText('Restored 1 item')).toBeInTheDocument();
    expect(onRestored).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByText('report.pdf')).not.toBeInTheDocument());
  });

  it('says what could not be restored and does not claim a restore', async () => {
    vi.mocked(restoreFromTrash).mockResolvedValue({
      restored: [],
      failed: [{ path: 'notes.md', error: 'Something with this name already exists where it was deleted from' }],
    });
    const { user, onRestored } = setup();
    await screen.findByText('3 items · 3 KB');
    await user.click(within(card('b')).getByRole('button', { name: 'Restore' }));

    expect(await screen.findByText('Couldn’t restore “notes.md”')).toBeInTheDocument();
    expect(screen.getByText(/already exists/)).toBeInTheDocument();
    expect(onRestored).not.toHaveBeenCalled();
  });

  it('asks before deleting a batch for good', async () => {
    const { user } = setup();
    await screen.findByText('3 items · 3 KB');
    await user.click(within(card('b')).getByRole('button', { name: 'Delete forever' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete forever?' });
    expect(deleteFromTrash).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(deleteFromTrash).toHaveBeenCalledWith(BATCH_B.id));
    expect(await screen.findByText('Deleted for good')).toBeInTheDocument();
  });

  it('restores one item of a delete that had several, and leaves the rest', async () => {
    const { user, onRestored } = setup();
    await screen.findByText('3 items · 3 KB');

    await user.click(within(card('a')).getByRole('button', { name: 'Restore report.pdf' }));

    await waitFor(() => expect(restoreFromTrash).toHaveBeenCalledWith(BATCH_A.id, ['docs/report.pdf']));
    expect(onRestored).toHaveBeenCalledTimes(1);
  });

  it('asks before deleting one item for good, and names it', async () => {
    const { user } = setup();
    await screen.findByText('3 items · 3 KB');
    await user.click(within(card('a')).getByRole('button', { name: 'Delete photos forever' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete forever?' });
    expect(within(dialog).getByText('“photos” will be permanently deleted. This can’t be undone.')).toBeInTheDocument();
    expect(deleteFromTrash).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Delete forever' }));
    await waitFor(() => expect(deleteFromTrash).toHaveBeenCalledWith(BATCH_A.id, ['photos/']));
  });

  it('has no per-item buttons when a delete was a single item', async () => {
    setup();
    await screen.findByText('3 items · 3 KB');
    expect(within(card('b')).queryByRole('button', { name: /Restore notes/ })).not.toBeInTheDocument();
    expect(within(card('a')).getByRole('button', { name: 'Restore photos' })).toBeInTheDocument();
  });

  it('does nothing when deleting for good is cancelled', async () => {
    const { user } = setup();
    await screen.findByText('3 items · 3 KB');
    await user.click(within(card('b')).getByRole('button', { name: 'Delete forever' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));
    expect(deleteFromTrash).not.toHaveBeenCalled();
  });

  it('empties the whole trash after confirmation', async () => {
    const { user } = setup();
    await screen.findByText('3 items · 3 KB');
    list.mockResolvedValue({ batches: [], total_size: 0 });
    await user.click(screen.getByRole('button', { name: 'Empty trash' }));

    const dialog = await screen.findByRole('dialog', { name: 'Empty the trash?' });
    expect(dialog).toHaveTextContent('3 items');
    expect(emptyTrash).not.toHaveBeenCalled();
    await user.click(within(dialog).getByRole('button', { name: 'Empty trash' }));
    await waitFor(() => expect(emptyTrash).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('The trash is empty', { selector: 'h2' })).toBeInTheDocument();
  });

  it('reports an action that failed and keeps showing the trash', async () => {
    vi.mocked(restoreFromTrash).mockRejectedValue(new Error('That item is no longer in the trash'));
    const { user } = setup();
    await screen.findByText('3 items · 3 KB');
    await user.click(within(card('a')).getByRole('button', { name: 'Restore' }));
    expect(await screen.findAllByText('That item is no longer in the trash')).not.toHaveLength(0);
    expect(screen.getByRole('list', { name: 'Deleted items' })).toBeInTheDocument();
  });

  it('opens the navigation on small screens', async () => {
    const { user, onOpenNav } = setup();
    await user.click(screen.getByRole('button', { name: 'Open navigation' }));
    expect(onOpenNav).toHaveBeenCalledTimes(1);
  });
});
