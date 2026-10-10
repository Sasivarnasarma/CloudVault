import { act, renderHook, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { dirEntry, dropItems, fileEntry } from '../../test/fsEntries';
import { useFileDrop } from './useFileDrop';

function dragEvent(type: string, { files = true, items }: { files?: boolean; items?: DataTransferItemList } = {}) {
  const event = new Event(type, { cancelable: true }) as DragEvent;
  Object.defineProperty(event, 'dataTransfer', { value: { types: files ? ['Files'] : ['text/plain'], items } });
  return event;
}

describe('useFileDrop', () => {
  it('shows the overlay while files are dragged over the window and hides it on leave', () => {
    const { result } = renderHook(() => useFileDrop({ onDrop: vi.fn() }));
    expect(result.current.dragging).toBe(false);

    act(() => void window.dispatchEvent(dragEvent('dragenter')));
    expect(result.current.dragging).toBe(true);
    act(() => void window.dispatchEvent(dragEvent('dragenter'))); // entering a child element
    act(() => void window.dispatchEvent(dragEvent('dragleave')));
    expect(result.current.dragging).toBe(true); // still inside the window
    act(() => void window.dispatchEvent(dragEvent('dragleave')));
    expect(result.current.dragging).toBe(false);
  });

  it('ignores drags that are not files, such as moving items around the page', () => {
    const onDrop = vi.fn();
    const { result } = renderHook(() => useFileDrop({ onDrop }));
    act(() => void window.dispatchEvent(dragEvent('dragenter', { files: false })));
    expect(result.current.dragging).toBe(false);
    const drop = dragEvent('drop', { files: false });
    act(() => void window.dispatchEvent(drop));
    expect(drop.defaultPrevented).toBe(false);
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('allows dropping by cancelling dragover for files only', () => {
    renderHook(() => useFileDrop({ onDrop: vi.fn() }));
    const over = dragEvent('dragover');
    window.dispatchEvent(over);
    expect(over.defaultPrevented).toBe(true);
    const other = dragEvent('dragover', { files: false });
    window.dispatchEvent(other);
    expect(other.defaultPrevented).toBe(false);
  });

  it('hands dropped files and folders to onDrop with their relative paths', async () => {
    const onDrop = vi.fn();
    const onScanStart = vi.fn();
    const onScanEnd = vi.fn();
    const { result } = renderHook(() => useFileDrop({ onDrop, onScanStart, onScanEnd }));
    act(() => void window.dispatchEvent(dragEvent('dragenter')));

    const items = dropItems(dirEntry('Docs', [fileEntry('a.txt'), dirEntry('sub', [fileEntry('b.txt')])]));
    const drop = dragEvent('drop', { items });
    act(() => void window.dispatchEvent(drop));

    expect(drop.defaultPrevented).toBe(true);
    expect(result.current.dragging).toBe(false);
    expect(onScanStart).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(onDrop).toHaveBeenCalledTimes(1));
    expect(onDrop.mock.calls[0][0].sources.map((s: { path: string }) => s.path).sort()).toEqual([
      'Docs/a.txt',
      'Docs/sub/b.txt',
    ]);
    await waitFor(() => expect(onScanEnd).toHaveBeenCalledTimes(1));
  });

  it('reports a failure to read the drop and still ends the scan', async () => {
    const onError = vi.fn();
    const onScanEnd = vi.fn();
    const broken = {
      isFile: false,
      isDirectory: true,
      name: 'Broken',
      createReader: () => ({ readEntries: (_ok: unknown, fail: (e: Error) => void) => fail(new Error('denied')) }),
    } as unknown as FileSystemEntry;
    renderHook(() => useFileDrop({ onDrop: vi.fn(), onError, onScanEnd }));
    act(() => void window.dispatchEvent(dragEvent('drop', { items: dropItems(broken) })));
    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(onScanEnd).toHaveBeenCalled());
  });

  it('stops listening when unmounted', () => {
    const onDrop = vi.fn();
    const { unmount } = renderHook(() => useFileDrop({ onDrop }));
    unmount();
    const drop = dragEvent('drop', { items: dropItems(new File(['x'], 'a.txt')) });
    window.dispatchEvent(drop);
    expect(drop.defaultPrevented).toBe(false);
  });
});
