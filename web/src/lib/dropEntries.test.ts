import { describe, expect, it } from 'vitest';
import { dirEntry, dropItems, fileEntry } from '../test/fsEntries';
import { fromDirectoryInput, readDroppedItems } from './dropEntries';

describe('readDroppedItems', () => {
  it('returns loose files without a path', async () => {
    const file = new File(['x'], 'a.txt');
    const result = await readDroppedItems(dropItems(file));
    expect(result.sources).toEqual([{ file }]);
    expect(result.emptyFolders).toEqual([]);
  });

  it('walks folders recursively and keeps relative paths', async () => {
    const tree = dirEntry('Photos', [
      fileEntry('cover.jpg'),
      dirEntry('2026', [fileEntry('a.jpg'), fileEntry('b.jpg'), dirEntry('raw', [fileEntry('c.raw')])]),
      fileEntry('notes.txt'),
    ]);
    const { sources } = await readDroppedItems(dropItems(tree));
    expect(sources.map((s) => s.path).sort()).toEqual([
      'Photos/2026/a.jpg',
      'Photos/2026/b.jpg',
      'Photos/2026/raw/c.raw',
      'Photos/cover.jpg',
      'Photos/notes.txt',
    ]);
    expect(sources.every((s) => s.file instanceof File)).toBe(true);
  });

  it('reads directories that return their entries in several batches', async () => {
    const many = Array.from({ length: 7 }, (_, i) => fileEntry(`f${i}.txt`));
    const { sources } = await readDroppedItems(dropItems(dirEntry('Big', many, 2)));
    expect(sources).toHaveLength(7);
  });

  it('mixes files and folders from a single drop', async () => {
    const loose = new File(['x'], 'loose.txt');
    const { sources } = await readDroppedItems(dropItems(loose, dirEntry('Docs', [fileEntry('a.txt')])));
    expect(sources.map((s) => s.path ?? s.file.name).sort()).toEqual(['Docs/a.txt', 'loose.txt']);
  });

  it('reports folders with no files so they are not lost', async () => {
    const tree = dirEntry('Project', [fileEntry('readme.md'), dirEntry('empty', []), dirEntry('nested', [dirEntry('deeper', [])])]);
    const result = await readDroppedItems(dropItems(tree));
    expect(result.sources.map((s) => s.path)).toEqual(['Project/readme.md']);
    expect(result.emptyFolders.sort()).toEqual(['Project/empty', 'Project/nested/deeper']);
  });

  it('leaves out operating system junk files and counts them', async () => {
    const tree = dirEntry('Stuff', [fileEntry('real.txt'), fileEntry('.DS_Store'), fileEntry('Thumbs.db'), fileEntry('desktop.ini')]);
    const result = await readDroppedItems(dropItems(tree));
    expect(result.sources.map((s) => s.path)).toEqual(['Stuff/real.txt']);
    expect(result.skipped).toBe(3);
  });

  it('treats a folder that only contained junk as an empty folder', async () => {
    const result = await readDroppedItems(dropItems(dirEntry('OnlyJunk', [fileEntry('.DS_Store')])));
    expect(result.sources).toEqual([]);
    expect(result.emptyFolders).toEqual(['OnlyJunk']);
  });

  it('copes with a missing or empty item list and non-file items', async () => {
    expect(await readDroppedItems(null)).toEqual({ sources: [], emptyFolders: [], skipped: 0 });
    const text = [{ kind: 'string', webkitGetAsEntry: () => null, getAsFile: () => null }] as unknown as DataTransferItemList;
    expect((await readDroppedItems(text)).sources).toEqual([]);
  });

  it('rejects when the browser fails to read a directory', async () => {
    const broken = {
      isFile: false,
      isDirectory: true,
      name: 'Broken',
      createReader: () => ({ readEntries: (_ok: unknown, fail: (e: Error) => void) => fail(new Error('denied')) }),
    } as unknown as FileSystemEntry;
    await expect(readDroppedItems(dropItems(broken))).rejects.toThrow('denied');
  });
});

describe('fromDirectoryInput', () => {
  const withPath = (name: string, path: string) => {
    const file = new File(['x'], name);
    Object.defineProperty(file, 'webkitRelativePath', { value: path });
    return file;
  };

  it('uses the relative path the picker provides', () => {
    const result = fromDirectoryInput([withPath('a.txt', 'Docs/a.txt'), withPath('b.txt', 'Docs/sub/b.txt')]);
    expect(result.sources.map((s) => s.path)).toEqual(['Docs/a.txt', 'Docs/sub/b.txt']);
  });

  it('falls back to the file name and skips junk', () => {
    const result = fromDirectoryInput([new File(['x'], 'plain.txt'), withPath('.DS_Store', 'Docs/.DS_Store')]);
    expect(result.sources.map((s) => s.path)).toEqual(['plain.txt']);
    expect(result.skipped).toBe(1);
  });
});
