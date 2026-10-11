import { useCallback, useEffect, useRef, type PointerEvent as ReactPointerEvent } from 'react';
import { scrollParent } from '../../lib/dom';

/** How long a finger must rest on an item before dragging starts; moving sooner is a scroll. */
export const TOUCH_HOLD_MS = 350;
/** How far the finger may drift during that hold before it counts as a scroll. */
const SCROLL_SLOP_PX = 10;

/** Holding the finger this close to the top or bottom of the list scrolls it... */
const EDGE_PX = 72;
/** ...by up to this many pixels per frame, faster the closer the finger is to the edge. */
const MAX_SCROLL_PX = 16;

/** Elements that accept a drop carry `data-drop-prefix`; this marks the one under the finger. */
const DROP_ATTR = 'data-drop-prefix';
const OVER_ATTR = 'data-touch-over';

interface Options {
  /** The hold finished: these entries are now being dragged. */
  onStart: (ids: string[]) => void;
  /** The finger was lifted over a folder (its prefix, '' for the root). */
  onDrop: (prefix: string) => void;
  /** The drag ended without a drop (lifted elsewhere, or the touch was taken over). */
  onCancel: () => void;
}

function dropTargetAt(x: number, y: number): HTMLElement | null {
  const element = document.elementFromPoint?.(x, y);
  return element?.closest<HTMLElement>(`[${DROP_ATTR}]`) ?? null;
}

/**
 * Drag and drop with a finger. The browser's own drag and drop doesn't work with touch, so this does
 * it with pointer events: hold an item, then drag it over a folder (a card, a row, a folder in the
 * path or the up button) and lift. Moving before the hold ends is left alone, so scrolling works; once dragging, holding the finger near
 * the top or bottom edge of the list scrolls it.
 * Drop targets are the elements with `data-drop-prefix`.
 */
export function useTouchDrag({ onStart, onDrop, onCancel }: Options) {
  // The latest callbacks, so a gesture that is running always calls the current ones.
  const callbacks = useRef({ onStart, onDrop, onCancel });
  useEffect(() => {
    callbacks.current = { onStart, onDrop, onCancel };
  });

  const begin = useCallback((event: ReactPointerEvent, ids: string[], label: string) => {
    if (event.pointerType !== 'touch') return;
    const { pointerId, clientX: startX, clientY: startY } = event;

    let armed = false;
    let ghost: HTMLElement | null = null;
    let over: HTMLElement | null = null;
    let frame = 0;
    let lastX = startX;
    let lastY = startY;
    const origin = event.target instanceof HTMLElement ? event.target : null;
    const scroller = origin ? scrollParent(origin) : null;

    const setOver = (next: HTMLElement | null) => {
      if (next === over) return;
      over?.removeAttribute(OVER_ATTR);
      next?.setAttribute(OVER_ATTR, '');
      over = next;
    };

    const timer = window.setTimeout(() => {
      armed = true;
      navigator.vibrate?.(15);
      ghost = document.createElement('div');
      ghost.textContent = label;
      ghost.setAttribute('aria-hidden', 'true');
      ghost.style.cssText =
        'position:fixed;z-index:60;left:0;top:0;pointer-events:none;padding:6px 12px;border-radius:12px;' +
        'font:500 13px system-ui,sans-serif;background:var(--color-accent,#2563eb);color:#fff;' +
        'box-shadow:0 8px 24px rgb(0 0 0 / .25);max-width:70vw;white-space:nowrap;overflow:hidden;' +
        'text-overflow:ellipsis;transform:translate(-9999px,-9999px)';
      document.body.appendChild(ghost);
      moveGhost(startX, startY);
      callbacks.current.onStart(ids);
      frame = requestAnimationFrame(autoScroll);
    }, TOUCH_HOLD_MS);

    /** Scroll the list while the finger rests near its top or bottom edge, so a folder out of view can be reached. */
    function autoScroll() {
      if (scroller) {
        const box = scroller.getBoundingClientRect();
        const fromTop = lastY - box.top;
        const fromBottom = box.bottom - lastY;
        let step = 0;
        if (fromTop < EDGE_PX) step = -MAX_SCROLL_PX * Math.min(1, (EDGE_PX - fromTop) / EDGE_PX);
        else if (fromBottom < EDGE_PX) step = MAX_SCROLL_PX * Math.min(1, (EDGE_PX - fromBottom) / EDGE_PX);
        if (step !== 0) {
          scroller.scrollTop += step;
          setOver(dropTargetAt(lastX, lastY)); // the content moved under the finger
        }
      }
      frame = requestAnimationFrame(autoScroll);
    }

    const moveGhost = (x: number, y: number) => {
      if (ghost) ghost.style.transform = `translate(${x + 12}px, ${y - 44}px)`;
    };

    /** Stop listening and tidy up. */
    const finish = () => {
      window.clearTimeout(timer);
      cancelAnimationFrame(frame);
      document.removeEventListener('pointermove', onMove);
      document.removeEventListener('pointerup', onUp);
      document.removeEventListener('pointercancel', onCancel);
      document.removeEventListener('touchmove', onTouchMove);
      setOver(null);
      ghost?.remove();
      ghost = null;
    };

    // Once the drag has started, the finger must not scroll the page as well.
    const onTouchMove = (e: TouchEvent) => {
      if (armed && e.cancelable) e.preventDefault();
    };

    function onMove(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      if (!armed) {
        if (Math.hypot(e.clientX - startX, e.clientY - startY) > SCROLL_SLOP_PX) {
          finish(); // the finger moved first: this is a scroll
        }
        return;
      }
      lastX = e.clientX;
      lastY = e.clientY;
      moveGhost(e.clientX, e.clientY);
      setOver(dropTargetAt(e.clientX, e.clientY));
    }

    function onUp(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const wasArmed = armed;
      const target = wasArmed ? dropTargetAt(e.clientX, e.clientY) : null;
      finish();
      if (!wasArmed) return;
      if (target) callbacks.current.onDrop(target.getAttribute(DROP_ATTR) ?? '');
      else callbacks.current.onCancel();
    }

    function onCancel(e: PointerEvent) {
      if (e.pointerId !== pointerId) return;
      const wasArmed = armed;
      finish();
      if (wasArmed) callbacks.current.onCancel();
    }

    document.addEventListener('pointermove', onMove);
    document.addEventListener('pointerup', onUp);
    document.addEventListener('pointercancel', onCancel);
    document.addEventListener('touchmove', onTouchMove, { passive: false });
  }, []);

  return { begin };
}
