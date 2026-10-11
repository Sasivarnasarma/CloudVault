import '@testing-library/jest-dom/vitest';
import { cleanup, configure } from '@testing-library/react';
import { toast } from 'sonner';
import { ReadableStream, TransformStream, WritableStream } from 'node:stream/web';
import { afterEach, vi } from 'vitest';

// Tests run in isolated VM contexts (see vite.config.ts), which lack Node's web streams.
globalThis.ReadableStream ??= ReadableStream as typeof globalThis.ReadableStream;
globalThis.WritableStream ??= WritableStream as typeof globalThis.WritableStream;
globalThis.TransformStream ??= TransformStream as typeof globalThis.TransformStream;

// user-event waits a timer tick between simulated actions to look like a person. These tests don't
// need that, and across hundreds of clicks and key presses it is a large part of the run time, so every
// instance, and the direct `userEvent.click(...)` style calls, run without the pause.
vi.mock('@testing-library/user-event', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@testing-library/user-event')>();
  const original = actual.default;
  const setup = (options: Parameters<typeof original.setup>[0] = {}) => original.setup({ delay: null, ...options });
  const direct = [
    'click',
    'dblClick',
    'tripleClick',
    'hover',
    'unhover',
    'type',
    'clear',
    'keyboard',
    'upload',
    'paste',
    'pointer',
    'tab',
    'selectOptions',
    'deselectOptions',
    'copy',
    'cut',
  ];
  // Each direct call gets a fresh instance, as user-event itself does, so no pressed keys or pointer
  // position carry over from one call to the next.
  const call = (name: string, args: unknown[]) =>
    (setup() as unknown as Record<string, (...a: unknown[]) => unknown>)[name](...args);
  const patched = Object.assign(
    {},
    original,
    { setup },
    Object.fromEntries(direct.map((name) => [name, (...args: unknown[]) => call(name, args)])),
  );
  return { ...actual, default: patched, userEvent: patched };
});

// Generous so the suite stays stable when many jsdom workers run in parallel.
configure({ asyncUtilTimeout: 5000 });

afterEach(() => {
  cleanup();
  toast.dismiss(); // sonner keeps its toasts globally, so one test's would leak into the next
  window.history.replaceState(null, '', '/');
});

// jsdom lacks several browser APIs that Radix UI and motion rely on.
class ResizeObserverStub {
  observe() {}
  unobserve() {}
  disconnect() {}
}
globalThis.ResizeObserver ??= ResizeObserverStub;

if (!window.matchMedia) {
  window.matchMedia = (query: string): MediaQueryList =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }) as MediaQueryList;
}

Element.prototype.hasPointerCapture ??= () => false;
Element.prototype.setPointerCapture ??= () => {};
Element.prototype.releasePointerCapture ??= () => {};
Element.prototype.scrollIntoView ??= () => {};
