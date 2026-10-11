import { act, renderHook } from '@testing-library/react';
import type { PointerEvent as ReactPointerEvent } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TOUCH_HOLD_MS, useTouchDrag } from './useTouchDrag';

/** jsdom has no PointerEvent; this one carries what the hook reads. */
class FakePointerEvent extends MouseEvent {
  pointerId: number;
  pointerType: string;
  constructor(type: string, init: PointerEventInit = {}) {
    super(type, { bubbles: true, ...init });
    this.pointerId = init.pointerId ?? 1;
    this.pointerType = init.pointerType ?? 'touch';
  }
}

const press = (type: string, x = 100, y = 100, pointerId = 1) =>
  act(() => void document.dispatchEvent(new FakePointerEvent(type, { clientX: x, clientY: y, pointerId })));

function setup() {
  const h = { onStart: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
  const { result } = renderHook(() => useTouchDrag(h));
  const begin = (pointerType = 'touch') =>
    result.current.begin(
      { pointerType, pointerId: 1, clientX: 100, clientY: 100 } as ReactPointerEvent,
      ['a.txt', 'b.txt'],
      '2 items',
    );
  return { h, begin };
}

const folder = document.createElement('div');
folder.setAttribute('data-drop-prefix', 'Photos/');
const root = document.createElement('div');
root.setAttribute('data-drop-prefix', '');

beforeEach(() => {
  vi.useFakeTimers();
  vi.stubGlobal('PointerEvent', FakePointerEvent);
  document.body.append(folder, root);
  document.elementFromPoint = vi.fn(() => folder);
});
afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  folder.remove();
  root.remove();
  folder.removeAttribute('data-touch-over');
  document.querySelectorAll('[aria-hidden="true"]').forEach((el) => el.remove());
});

const hold = () => act(() => void vi.advanceTimersByTime(TOUCH_HOLD_MS + 5));

describe('useTouchDrag', () => {
  it('starts dragging once the finger has rested on the item, and shows what is being dragged', () => {
    const { h, begin } = setup();
    begin();
    act(() => void vi.advanceTimersByTime(TOUCH_HOLD_MS - 50));
    expect(h.onStart).not.toHaveBeenCalled();

    hold();
    expect(h.onStart).toHaveBeenCalledWith(['a.txt', 'b.txt']);
    expect(document.body).toHaveTextContent('2 items');
  });

  it('leaves the gesture alone when the finger moves first: that is a scroll', () => {
    const { h, begin } = setup();
    begin();
    press('pointermove', 100, 130);
    hold();
    expect(h.onStart).not.toHaveBeenCalled();
    press('pointerup', 100, 130);
    expect(h.onDrop).not.toHaveBeenCalled();
    expect(h.onCancel).not.toHaveBeenCalled();
  });

  it('ignores a mouse or a pen', () => {
    const { h, begin } = setup();
    begin('mouse');
    hold();
    expect(h.onStart).not.toHaveBeenCalled();
  });

  it('marks the folder under the finger and drops on it when the finger is lifted', () => {
    const { h, begin } = setup();
    begin();
    hold();

    press('pointermove', 150, 160);
    expect(folder).toHaveAttribute('data-touch-over');

    press('pointerup', 150, 160);
    expect(h.onDrop).toHaveBeenCalledWith('Photos/');
    expect(folder).not.toHaveAttribute('data-touch-over');
    expect(document.body).not.toHaveTextContent('2 items');
  });

  it('can drop on the root, whose prefix is empty', () => {
    vi.mocked(document.elementFromPoint).mockReturnValue(root);
    const { h, begin } = setup();
    begin();
    hold();
    press('pointerup');
    expect(h.onDrop).toHaveBeenCalledWith('');
  });

  it('moves the mark when the finger moves to another folder, and clears it over empty space', () => {
    const { begin } = setup();
    begin();
    hold();
    press('pointermove');
    expect(folder).toHaveAttribute('data-touch-over');

    vi.mocked(document.elementFromPoint).mockReturnValue(root);
    press('pointermove');
    expect(folder).not.toHaveAttribute('data-touch-over');
    expect(root).toHaveAttribute('data-touch-over');

    vi.mocked(document.elementFromPoint).mockReturnValue(null);
    press('pointermove');
    expect(root).not.toHaveAttribute('data-touch-over');
  });

  it('cancels when the finger is lifted over nothing', () => {
    vi.mocked(document.elementFromPoint).mockReturnValue(null);
    const { h, begin } = setup();
    begin();
    hold();
    press('pointerup');
    expect(h.onDrop).not.toHaveBeenCalled();
    expect(h.onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels when the browser takes the touch over', () => {
    const { h, begin } = setup();
    begin();
    hold();
    press('pointercancel');
    expect(h.onCancel).toHaveBeenCalledTimes(1);
    expect(document.body).not.toHaveTextContent('2 items');
  });

  it('keeps the page from scrolling only once the drag has started', () => {
    const { begin } = setup();
    begin();
    const early = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(early);
    expect(early.defaultPrevented).toBe(false);

    hold();
    const late = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(late);
    expect(late.defaultPrevented).toBe(true);

    press('pointerup');
    const after = new Event('touchmove', { cancelable: true });
    document.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
  });

  it('ignores other fingers', () => {
    const { h, begin } = setup();
    begin();
    hold();
    press('pointerup', 100, 100, 2);
    expect(h.onDrop).not.toHaveBeenCalled();
    press('pointerup');
    expect(h.onDrop).toHaveBeenCalled();
  });
});

describe('useTouchDrag: scrolling the list while dragging', () => {
  let frames: FrameRequestCallback[];
  let list: HTMLElement;
  let item: HTMLElement;

  /** Run the animation frame that is waiting, as the browser would. */
  const nextFrame = () => act(() => void frames.splice(0).forEach((run) => run(0)));

  beforeEach(() => {
    frames = [];
    vi.stubGlobal('requestAnimationFrame', (run: FrameRequestCallback) => frames.push(run));
    vi.stubGlobal('cancelAnimationFrame', () => frames.splice(0));
    list = document.createElement('div');
    list.style.overflowY = 'auto';
    list.getBoundingClientRect = () => ({ top: 0, bottom: 600, left: 0, right: 400 }) as DOMRect;
    item = document.createElement('div');
    list.append(item);
    document.body.append(list);
  });
  afterEach(() => list.remove());

  function start() {
    const h = { onStart: vi.fn(), onDrop: vi.fn(), onCancel: vi.fn() };
    const { result } = renderHook(() => useTouchDrag(h));
    result.current.begin(
      { pointerType: 'touch', pointerId: 1, clientX: 100, clientY: 300, target: item } as unknown as ReactPointerEvent,
      ['a.txt'],
      'a.txt',
    );
    act(() => void vi.advanceTimersByTime(TOUCH_HOLD_MS + 5));
    return h;
  }

  it('scrolls down while the finger rests near the bottom edge, faster the closer it is', () => {
    start();
    press('pointermove', 100, 560);
    nextFrame();
    const slow = list.scrollTop;
    expect(slow).toBeGreaterThan(0);

    press('pointermove', 100, 598);
    nextFrame();
    expect(list.scrollTop - slow).toBeGreaterThan(slow);
  });

  it('scrolls up near the top edge', () => {
    start();
    list.scrollTop = 200;
    press('pointermove', 100, 5);
    nextFrame();
    expect(list.scrollTop).toBeLessThan(200);
  });

  it('does not scroll while the finger is in the middle', () => {
    start();
    press('pointermove', 100, 300);
    nextFrame();
    nextFrame();
    expect(list.scrollTop).toBe(0);
  });

  it('marks the folder that has come under the finger as the list moves', () => {
    start();
    press('pointermove', 100, 590);
    vi.mocked(document.elementFromPoint).mockReturnValue(folder);
    nextFrame();
    expect(folder).toHaveAttribute('data-touch-over');
  });

  it('stops scrolling when the finger is lifted', () => {
    start();
    press('pointermove', 100, 590);
    press('pointerup', 100, 590);
    const before = list.scrollTop;
    nextFrame();
    expect(list.scrollTop).toBe(before);
    expect(frames).toHaveLength(0);
  });
});
