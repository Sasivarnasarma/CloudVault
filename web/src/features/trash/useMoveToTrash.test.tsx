import { act, renderHook } from '@testing-library/react';
import { toast } from 'sonner';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { useMoveToTrash } from './useMoveToTrash';

vi.mock('../../services/trashService', () => ({ moveToTrash: vi.fn(), restoreFromTrash: vi.fn() }));
import { moveToTrash, restoreFromTrash } from '../../services/trashService';

const file = (key: string): Entry => {
  const f = makeFile(key, { name: key.split('/').pop() });
  return { type: 'file', id: f.key, name: f.name, file: f };
};
const folder = (name: string): Entry => {
  const f = makeFolder(name);
  return { type: 'folder', id: f.prefix, name, folder: f };
};

const batch = (paths: string[]) => ({
  id: '20260101T000000Z-abc123',
  deleted_at: '2026-01-01T00:00:00Z',
  total_size: paths.length,
  roots: paths.map((path) => ({
    path,
    type: path.endsWith('/') ? ('folder' as const) : ('file' as const),
    size: 1,
    item_count: 1,
  })),
});

function setup() {
  const h = { onMoved: vi.fn(), onRefresh: vi.fn(), onDeleteForever: vi.fn() };
  const { result } = renderHook(() => useMoveToTrash(h));
  return { result, ...h };
}

beforeEach(() => {
  vi.mocked(moveToTrash)
    .mockReset()
    .mockImplementation(async (items) => ({ batch: batch(items.map((i) => i.path)), failed: [] }));
  vi.mocked(restoreFromTrash)
    .mockReset()
    .mockResolvedValue({ restored: ['a.txt'], failed: [] });
});
afterEach(() => {
  vi.restoreAllMocks();
  toast.dismiss();
});

describe('useMoveToTrash', () => {
  it('sends files by key and folders by prefix, then tells the page what went', async () => {
    const { result, onMoved, onRefresh } = setup();
    await act(() => result.current.request([file('docs/a.txt'), folder('Photos')]));

    expect(moveToTrash).toHaveBeenCalledWith([
      { path: 'docs/a.txt', type: 'file' },
      { path: 'Photos/', type: 'folder' },
    ]);
    expect(onMoved).toHaveBeenCalledWith(['docs/a.txt', 'Photos/']);
    expect(onRefresh).toHaveBeenCalled();
  });

  it('gives the success toast an Undo button that restores the batch', async () => {
    const success = vi.spyOn(toast, 'success');
    const { result, onRefresh } = setup();
    await act(() => result.current.request([file('a.txt')]));

    const [message, options] = success.mock.calls[0];
    expect(message).toBe('Moved 1 file to the trash');
    const action = (options as unknown as { action: { onClick: () => void } }).action;
    await act(async () => action.onClick());

    expect(restoreFromTrash).toHaveBeenCalledWith('20260101T000000Z-abc123');
    expect(onRefresh).toHaveBeenCalledTimes(2); // after the delete and after the undo
  });

  it('can undo the latest delete once, and says there is nothing to undo before that', async () => {
    const { result } = setup();
    expect(result.current.undoLast()).toBe(false);

    await act(() => result.current.request([file('a.txt')]));
    await act(async () => void result.current.undoLast());
    expect(restoreFromTrash).toHaveBeenCalledTimes(1);
    expect(result.current.undoLast()).toBe(false);
  });

  it('only counts what moved, and offers to delete the rest for good', async () => {
    vi.mocked(moveToTrash).mockResolvedValue({
      batch: batch(['small.txt']),
      failed: [{ path: 'big.bin', error: 'The object is too large to copy in one step' }],
    });
    const error = vi.spyOn(toast, 'error');
    const { result, onMoved, onDeleteForever } = setup();
    await act(() => result.current.request([file('small.txt'), file('big.bin')]));

    expect(onMoved).toHaveBeenCalledWith(['small.txt']);
    const [message, options] = error.mock.calls[0];
    expect(message).toBe('Couldn’t move 1 of 2 items to the trash');
    const action = (options as unknown as { action: { onClick: () => void } }).action;
    action.onClick();
    expect(onDeleteForever).toHaveBeenCalledWith([expect.objectContaining({ id: 'big.bin' })]);
  });

  it('does not remember a batch when nothing could be moved', async () => {
    vi.mocked(moveToTrash).mockResolvedValue({ batch: null, failed: [{ path: 'a.txt', error: 'nope' }] });
    const { result, onMoved } = setup();
    await act(() => result.current.request([file('a.txt')]));
    expect(onMoved).not.toHaveBeenCalled();
    expect(result.current.undoLast()).toBe(false);
  });

  it('reports a failed request, and is not left busy', async () => {
    vi.mocked(moveToTrash).mockRejectedValue(new Error('Storage service is unavailable'));
    const error = vi.spyOn(toast, 'error');
    const { result, onMoved } = setup();
    await act(() => result.current.request([file('a.txt')]));

    expect(error).toHaveBeenCalledWith('Storage service is unavailable');
    expect(onMoved).not.toHaveBeenCalled();
    expect(result.current.busy).toBe(false);
  });

  it('says what could not be restored when undoing', async () => {
    vi.mocked(restoreFromTrash).mockResolvedValue({
      restored: [],
      failed: [{ path: 'docs/', error: 'Something with this name already exists where it was deleted from' }],
    });
    const error = vi.spyOn(toast, 'error');
    const { result } = setup();
    await act(() => result.current.request([folder('docs')]));
    await act(async () => void result.current.undoLast());

    expect(error).toHaveBeenCalledWith(
      'Couldn’t restore “docs”',
      expect.objectContaining({ description: expect.stringContaining('already exists') }),
    );
  });

  it('does nothing for an empty list', async () => {
    const { result } = setup();
    await act(() => result.current.request([]));
    expect(moveToTrash).not.toHaveBeenCalled();
  });
});
