import { act, renderHook } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { useUndoStack } from './useUndoStack';

describe('useUndoStack', () => {
  it('has nothing to undo at first', () => {
    const { result } = renderHook(() => useUndoStack());
    expect(result.current.undoLast()).toBe(false);
  });

  it('undoes the latest change first, then the one before, once each', async () => {
    const { result } = renderHook(() => useUndoStack());
    const order: string[] = [];
    act(() => {
      result.current.push(async () => void order.push('first'));
      result.current.push(async () => void order.push('second'));
    });

    expect(result.current.undoLast()).toBeUndefined();
    expect(result.current.undoLast()).toBeUndefined();
    expect(result.current.undoLast()).toBe(false);
    await act(async () => undefined);
    expect(order).toEqual(['second', 'first']);
  });

  it('undoes a particular change by its id, and only once', async () => {
    const { result } = renderHook(() => useUndoStack());
    const older = vi.fn(async () => undefined);
    const newer = vi.fn(async () => undefined);
    let olderId = 0;
    act(() => {
      olderId = result.current.push(older);
      result.current.push(newer);
    });

    await act(() => result.current.undo(olderId));
    await act(() => result.current.undo(olderId));
    expect(older).toHaveBeenCalledTimes(1);
    expect(newer).not.toHaveBeenCalled();

    // What was undone by id is gone from the stack: Ctrl+Z goes to the newer change.
    act(() => void result.current.undoLast());
    expect(newer).toHaveBeenCalledTimes(1);
  });

  it('keeps only the latest twenty changes', () => {
    const { result } = renderHook(() => useUndoStack());
    const runs = Array.from({ length: 25 }, () => vi.fn(async () => undefined));
    act(() => runs.forEach((run) => result.current.push(run)));

    let undone = 0;
    while (result.current.undoLast() !== false) undone += 1;
    expect(undone).toBe(20);
    expect(runs[0]).not.toHaveBeenCalled();
    expect(runs[24]).toHaveBeenCalled();
  });
});
