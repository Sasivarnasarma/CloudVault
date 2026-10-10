import { describe, expect, it } from 'vitest';
import { makeFile, makeFolder } from '../test/fixtures';
import { copyName, entryPath, parentPrefix, validateEntryName } from './paths';

describe('parentPrefix', () => {
  it.each([
    ['a/b/c.txt', 'a/b/'],
    ['c.txt', ''],
    ['a/b/', 'a/'],
    ['a/', ''],
    ['', ''],
  ])('%j -> %j', (input, expected) => {
    expect(parentPrefix(input)).toBe(expected);
  });
});

describe('entryPath', () => {
  it('uses the key for files and the prefix for folders', () => {
    const file = makeFile('a/b.txt');
    const folder = makeFolder('docs', 'a/');
    expect(entryPath({ type: 'file', id: file.key, name: 'b.txt', file })).toBe('a/b.txt');
    expect(entryPath({ type: 'folder', id: folder.prefix, name: 'docs', folder })).toBe('a/docs/');
  });
});

describe('validateEntryName', () => {
  it('accepts ordinary names, including spaces and unicode', () => {
    for (const name of ['report.pdf', 'my file (1).txt', 'ünï.md', '.env', 'a:b']) {
      expect(validateEntryName(name)).toBeNull();
    }
  });

  it.each(['', '   ', 'a/b', 'a\\b', '.', '..', 'bad\nname', 'x'.repeat(300)])('rejects %j', (name) => {
    expect(validateEntryName(name)).not.toBeNull();
  });
});

describe('copyName', () => {
  it('puts "(copy)" before the extension', () => {
    expect(copyName('report.pdf', new Set(['report.pdf']))).toBe('report (copy).pdf');
    expect(copyName('archive.tar.gz', new Set())).toBe('archive.tar (copy).gz');
  });

  it('numbers further copies and skips names that are taken', () => {
    expect(copyName('report.pdf', new Set(['report (copy).pdf']))).toBe('report (copy 2).pdf');
    expect(copyName('report.pdf', new Set(['report (copy).pdf', 'report (copy 2).pdf']))).toBe('report (copy 3).pdf');
  });

  it('keeps names without an extension, hidden files and folders whole', () => {
    expect(copyName('README', new Set())).toBe('README (copy)');
    expect(copyName('.env', new Set())).toBe('.env (copy)');
    expect(copyName('v1.2', new Set(), true)).toBe('v1.2 (copy)');
    expect(copyName('Photos', new Set(['Photos (copy)']), true)).toBe('Photos (copy 2)');
  });
});
