import type { DragEvent } from 'react';
import { describe, expect, it } from 'vitest';
import { makeDataTransfer } from '../test/dataTransfer';
import { ENTRY_DRAG_TYPE, isEntryDrag, setEntryDrag } from './dragMove';

const asEvent = (dataTransfer: unknown) => ({ dataTransfer }) as unknown as DragEvent;

describe('dragMove', () => {
  it('stores the dragged ids under our own type, with a plain-text fallback, and allows moving', () => {
    const dt = makeDataTransfer();
    setEntryDrag(asEvent(dt), ['docs/a.txt', 'docs/Photos/']);
    expect(JSON.parse(dt.getData(ENTRY_DRAG_TYPE))).toEqual(['docs/a.txt', 'docs/Photos/']);
    expect(dt.getData('text/plain')).toBe('docs/a.txt\ndocs/Photos/');
    expect(dt.effectAllowed).toBe('move');
  });

  it('recognises our drags, and not drags of desktop files or text', () => {
    const ours = makeDataTransfer();
    setEntryDrag(asEvent(ours), ['a']);
    expect(isEntryDrag(asEvent(ours))).toBe(true);
    expect(isEntryDrag(asEvent(makeDataTransfer(['Files'])))).toBe(false);
    expect(isEntryDrag(asEvent(makeDataTransfer(['text/plain'])))).toBe(false);
    expect(isEntryDrag(asEvent(undefined))).toBe(false);
  });
});
