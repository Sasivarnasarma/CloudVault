import { ENTRY_DRAG_TYPE } from '../lib/dragMove';

/** A tiny DataTransfer stand-in (jsdom has none) that records what a drag source stores. */
export function makeDataTransfer(initialTypes: string[] = []) {
  const store = new Map<string, string>();
  const dt = {
    types: [...initialTypes] as string[],
    effectAllowed: 'none',
    dropEffect: 'none',
    setData(type: string, value: string) {
      store.set(type, value);
      if (!dt.types.includes(type)) dt.types.push(type);
    },
    getData: (type: string) => store.get(type) ?? '',
  };
  return dt;
}

/** What a dragover/drop on a target sees while one of our entries is being dragged. */
export const entryDragData = () => makeDataTransfer([ENTRY_DRAG_TYPE]);
/** What it sees while files are dragged in from the desktop. */
export const desktopFilesData = () => makeDataTransfer(['Files']);
