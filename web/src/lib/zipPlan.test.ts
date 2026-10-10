import { describe, expect, it } from 'vitest';
import { makeFile, makeFolder } from '../test/fixtures';
import type { FolderTreeResponse } from '../types';
import type { Entry } from './entries';
import { archiveName, planZip } from './zipPlan';

const file = (key: string, size = 1): Entry => {
  const f = makeFile(key, { name: key.split('/').pop(), size });
  return { type: 'file', id: f.key, name: f.name, file: f };
};
const folder = (name: string, parent = ''): Entry => {
  const f = makeFolder(name, parent);
  return { type: 'folder', id: f.prefix, name, folder: f };
};
const tree = (prefix: string, files: [string, number][], emptyFolders: string[] = []): [string, FolderTreeResponse] => [
  prefix,
  {
    prefix,
    files: files.map(([key, size]) => ({ key, size })),
    empty_folders: emptyFolders,
    total_size: files.reduce((sum, [, size]) => sum + size, 0),
  },
];

describe('archiveName', () => {
  it('uses the name of a single folder', () => {
    expect(archiveName([folder('Photos')])).toBe('Photos.zip');
  });

  it('uses a general name for a selection', () => {
    expect(archiveName([folder('Photos'), file('a.txt')])).toBe('CloudVault download.zip');
    expect(archiveName([file('a.txt'), file('b.txt')])).toBe('CloudVault download.zip');
  });

  it('removes characters that file systems do not allow', () => {
    expect(archiveName([folder('a:b?c')])).toBe('a_b_c.zip');
  });
});

describe('planZip', () => {
  it('puts selected files at the top of the zip', () => {
    const plan = planZip([file('docs/a.txt', 10), file('docs/b.txt', 5)], new Map());
    expect(plan.files).toEqual([
      { key: 'docs/a.txt', path: 'a.txt', size: 10 },
      { key: 'docs/b.txt', path: 'b.txt', size: 5 },
    ]);
    expect(plan.folders).toEqual([]);
    expect(plan.totalSize).toBe(15);
  });

  it('keeps a folder’s name and everything inside it below that name', () => {
    const plan = planZip(
      [folder('Photos', 'docs/')],
      new Map([
        tree('docs/Photos/', [
          ['docs/Photos/a.jpg', 3],
          ['docs/Photos/2024/b.jpg', 4],
        ]),
      ]),
    );
    expect(plan.files.map((f) => [f.key, f.path])).toEqual([
      ['docs/Photos/a.jpg', 'Photos/a.jpg'],
      ['docs/Photos/2024/b.jpg', 'Photos/2024/b.jpg'],
    ]);
    expect(plan.folders).toEqual([]);
    expect(plan.totalSize).toBe(7);
  });

  it('gives empty folders an entry of their own, including an empty selected folder', () => {
    const nested = planZip(
      [folder('Photos')],
      new Map([tree('Photos/', [['Photos/a.jpg', 1]], ['Photos/empty/', 'Photos/x/y/'].filter(Boolean))]),
    );
    expect(nested.folders).toEqual(['Photos/empty/', 'Photos/x/y/']);

    const empty = planZip([folder('Nothing')], new Map([tree('Nothing/', [])]));
    expect(empty.files).toEqual([]);
    expect(empty.folders).toEqual(['Nothing/']);
  });

  it('does not list the selected folder itself as an empty folder inside it', () => {
    const plan = planZip([folder('F')], new Map([tree('F/', [['F/a', 1]], ['F/'])]));
    expect(plan.folders).toEqual([]);
  });

  it('mixes files and folders', () => {
    const plan = planZip([folder('Photos'), file('notes.md', 2)], new Map([tree('Photos/', [['Photos/a.jpg', 3]])]));
    expect(plan.files.map((f) => f.path)).toEqual(['Photos/a.jpg', 'notes.md']);
  });

  it('renames entries whose names would clash, ignoring case', () => {
    const plan = planZip([file('a/Report.pdf'), file('b/report.pdf'), file('c/report.pdf')], new Map());
    expect(plan.files.map((f) => f.path)).toEqual(['Report.pdf', 'report (2).pdf', 'report (3).pdf']);

    const folders = planZip(
      [folder('Docs', 'a/'), folder('docs', 'b/')],
      new Map([tree('a/Docs/', [['a/Docs/x', 1]]), tree('b/docs/', [['b/docs/y', 1]])]),
    );
    expect(folders.files.map((f) => f.path)).toEqual(['Docs/x', 'docs (2)/y']);
  });

  it('refuses a folder whose contents were not loaded', () => {
    expect(() => planZip([folder('Photos')], new Map())).toThrow('were not loaded');
  });
});
