/** Minimal stand-ins for the FileSystemEntry objects browsers produce when files/folders are dropped. */

export function fileEntry(name: string, content = 'x'): FileSystemEntry {
  return {
    isFile: true,
    isDirectory: false,
    name,
    file: (ok: (f: File) => void) => ok(new File([content], name)),
  } as unknown as FileSystemEntry;
}

/** `pageSize` mimics browsers returning directory contents in batches. */
export function dirEntry(name: string, children: FileSystemEntry[], pageSize = 2): FileSystemEntry {
  return {
    isFile: false,
    isDirectory: true,
    name,
    createReader() {
      let index = 0;
      return {
        readEntries(ok: (entries: FileSystemEntry[]) => void) {
          const batch = children.slice(index, index + pageSize);
          index += pageSize;
          ok(batch);
        },
      };
    },
  } as unknown as FileSystemEntry;
}

/** A DataTransferItemList-like value for a drop. */
export function dropItems(...entries: Array<FileSystemEntry | File>): DataTransferItemList {
  const items = entries.map((entry) => {
    const isFile = entry instanceof File;
    return {
      kind: 'file',
      webkitGetAsEntry: (): FileSystemEntry | null => (isFile ? null : entry),
      getAsFile: (): File | null => (isFile ? entry : null),
    };
  });
  return items as unknown as DataTransferItemList;
}
