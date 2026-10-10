import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { deleteEntry, describeEntries, runBulk, summarize, transferEntry } from './bulkActions';

vi.mock('../../services/objectService', () => ({ copyObject: vi.fn(), deleteObject: vi.fn(), moveObject: vi.fn() }));
vi.mock('../../services/folderService', () => ({ copyFolder: vi.fn(), deleteFolder: vi.fn(), moveFolder: vi.fn() }));
import { copyFolder, deleteFolder, moveFolder } from '../../services/folderService';
import { copyObject, deleteObject, moveObject } from '../../services/objectService';

const file = (key: string): Entry => {
  const f = makeFile(key, { name: key.split('/').pop() });
  return { type: 'file', id: f.key, name: f.name, file: f };
};
const folder = (name: string, parent = ''): Entry => {
  const f = makeFolder(name, parent);
  return { type: 'folder', id: f.prefix, name, folder: f };
};

beforeEach(() => {
  for (const m of [copyObject, deleteObject, moveObject, copyFolder, deleteFolder, moveFolder]) {
    vi.mocked(m).mockReset().mockResolvedValue({} as never);
  }
});

describe('runBulk', () => {
  it('runs every entry, keeps results in input order and reports progress', async () => {
    const entries = [file('a'), file('b'), file('c')];
    const progress: number[] = [];
    const results = await runBulk(
      entries,
      async (entry) => {
        await new Promise((r) => setTimeout(r, entry.name === 'a' ? 10 : 0)); // a finishes last
      },
      { onProgress: (done) => progress.push(done) },
    );
    expect(results.map((r) => r.entry.name)).toEqual(['a', 'b', 'c']);
    expect(results.every((r) => r.ok)).toBe(true);
    expect(progress).toEqual([1, 2, 3]);
  });

  it('keeps going after failures and records each reason', async () => {
    const results = await runBulk([file('a'), file('b'), file('c')], async (entry) => {
      if (entry.name === 'b') throw new Error('Storage failed');
    });
    expect(results.map((r) => r.ok)).toEqual([true, false, true]);
    expect(results[1].error).toBe('Storage failed');
    const { succeeded, failed } = summarize(results);
    expect(succeeded).toHaveLength(2);
    expect(failed.map((r) => r.entry.name)).toEqual(['b']);
  });

  it('works through the list a few at a time', async () => {
    let running = 0;
    let peak = 0;
    await runBulk(Array.from({ length: 10 }, (_, i) => file(`f${i}`)), async () => {
      running++;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 2));
      running--;
    });
    expect(peak).toBe(4);
  });

  it('handles an empty list', async () => {
    expect(await runBulk([], async () => undefined)).toEqual([]);
  });
});

describe('deleteEntry', () => {
  it('deletes files by key and folders by prefix', async () => {
    await deleteEntry(file('docs/a.txt'));
    expect(deleteObject).toHaveBeenCalledWith('docs/a.txt');
    await deleteEntry(folder('Old', 'docs/'));
    expect(deleteFolder).toHaveBeenCalledWith('docs/Old/');
  });
});

describe('transferEntry', () => {
  it('moves and copies files into the destination folder, keeping their names', async () => {
    await transferEntry(file('a/x.txt'), 'move', 'b/', false);
    expect(moveObject).toHaveBeenCalledWith('a/x.txt', 'b/x.txt', false);
    await transferEntry(file('a/x.txt'), 'copy', 'b/', true);
    expect(copyObject).toHaveBeenCalledWith('a/x.txt', 'b/x.txt', true);
    await transferEntry(file('x.txt'), 'move', 'deep/er/', false);
    expect(moveObject).toHaveBeenLastCalledWith('x.txt', 'deep/er/x.txt', false);
  });

  it('can put the item under another name, for a copy made next to the original', async () => {
    await transferEntry(file('a/x.txt'), 'copy', 'a/', false, 'x (copy).txt');
    expect(copyObject).toHaveBeenCalledWith('a/x.txt', 'a/x (copy).txt', false);
    await transferEntry(folder('Photos', 'a/'), 'copy', 'a/', false, 'Photos (copy)');
    expect(copyFolder).toHaveBeenCalledWith('a/Photos/', 'a/Photos (copy)');
  });

  it('moves and copies folders without a trailing slash on the target', async () => {
    await transferEntry(folder('Photos', 'a/'), 'move', 'b/', false);
    expect(moveFolder).toHaveBeenCalledWith('a/Photos/', 'b/Photos');
    await transferEntry(folder('Photos'), 'copy', 'archive/', false);
    expect(copyFolder).toHaveBeenCalledWith('Photos/', 'archive/Photos');
  });

  it('refuses to move a file onto itself, and a folder into itself or where it already is', async () => {
    await expect(transferEntry(file('a/x.txt'), 'move', 'a/', false)).rejects.toThrow('Already in this folder');
    await expect(transferEntry(folder('Photos', 'a/'), 'move', 'a/', false)).rejects.toThrow('Already in this folder');
    await expect(transferEntry(folder('Photos', 'a/'), 'copy', 'a/Photos/', false)).rejects.toThrow('into itself');
    await expect(transferEntry(folder('Photos', 'a/'), 'move', 'a/Photos/deep/', false)).rejects.toThrow('into itself');
    expect(moveObject).not.toHaveBeenCalled();
    expect(moveFolder).not.toHaveBeenCalled();
    expect(copyFolder).not.toHaveBeenCalled();
  });

  it('allows a folder next to one whose name starts the same', async () => {
    await transferEntry(folder('docs'), 'move', 'docs2/', false);
    expect(moveFolder).toHaveBeenCalledWith('docs/', 'docs2/docs');
  });

  it('passes API failures through as errors', async () => {
    vi.mocked(moveObject).mockRejectedValueOnce(new Error('A file with this name already exists'));
    await expect(transferEntry(file('x.txt'), 'move', 'b/', false)).rejects.toThrow('already exists');
  });
});

describe('describeEntries', () => {
  it.each([
    [[file('a')], '1 file'],
    [[file('a'), file('b')], '2 files'],
    [[folder('x')], '1 folder'],
    [[file('a'), folder('x'), folder('y')], '1 file and 2 folders'],
    [[], ''],
  ])('describes %#', (entries, expected) => {
    expect(describeEntries(entries as Entry[])).toBe(expected);
  });
});
