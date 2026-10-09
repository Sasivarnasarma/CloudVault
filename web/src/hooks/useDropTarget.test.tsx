import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { desktopFilesData, entryDragData } from '../test/dataTransfer';
import { useDropTarget } from './useDropTarget';

function Target({ enabled, onDrop }: { enabled: boolean; onDrop: () => void }) {
  const { over, handlers } = useDropTarget({ enabled, onDrop });
  return (
    <div data-testid="target" data-over={over} {...handlers}>
      <span data-testid="child">child</span>
    </div>
  );
}

const target = () => screen.getByTestId('target');

describe('useDropTarget', () => {
  it('highlights while a dragged entry hovers it and calls onDrop when released', () => {
    const onDrop = vi.fn();
    render(<Target enabled onDrop={onDrop} />);
    const dataTransfer = entryDragData();

    fireEvent.dragEnter(target(), { dataTransfer });
    expect(target().dataset.over).toBe('true');
    expect(fireEvent.dragOver(target(), { dataTransfer })).toBe(false); // default prevented: drop allowed
    expect(dataTransfer.dropEffect).toBe('move');

    expect(fireEvent.drop(target(), { dataTransfer })).toBe(false);
    expect(onDrop).toHaveBeenCalledTimes(1);
    expect(target().dataset.over).toBe('false');
  });

  it('does not flicker when the pointer moves across child elements', () => {
    render(<Target enabled onDrop={vi.fn()} />);
    const dataTransfer = entryDragData();
    fireEvent.dragEnter(target(), { dataTransfer });
    fireEvent.dragEnter(screen.getByTestId('child'), { dataTransfer });
    fireEvent.dragLeave(target(), { dataTransfer }); // leaving the parent for the child
    expect(target().dataset.over).toBe('true');
    fireEvent.dragLeave(screen.getByTestId('child'), { dataTransfer });
    expect(target().dataset.over).toBe('false');
  });

  it('ignores drags of files from the desktop', () => {
    const onDrop = vi.fn();
    render(<Target enabled onDrop={onDrop} />);
    const dataTransfer = desktopFilesData();
    fireEvent.dragEnter(target(), { dataTransfer });
    expect(target().dataset.over).toBe('false');
    expect(fireEvent.dragOver(target(), { dataTransfer })).toBe(true);
    fireEvent.drop(target(), { dataTransfer });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('does nothing when disabled', () => {
    const onDrop = vi.fn();
    render(<Target enabled={false} onDrop={onDrop} />);
    const dataTransfer = entryDragData();
    fireEvent.dragEnter(target(), { dataTransfer });
    expect(target().dataset.over).toBe('false');
    expect(fireEvent.dragOver(target(), { dataTransfer })).toBe(true);
    fireEvent.drop(target(), { dataTransfer });
    expect(onDrop).not.toHaveBeenCalled();
  });

  it('stops highlighting if it becomes disabled mid-drag', () => {
    const { rerender } = render(<Target enabled onDrop={vi.fn()} />);
    fireEvent.dragEnter(target(), { dataTransfer: entryDragData() });
    expect(target().dataset.over).toBe('true');
    rerender(<Target enabled={false} onDrop={vi.fn()} />);
    expect(target().dataset.over).toBe('false');
  });
});
