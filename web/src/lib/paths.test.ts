import { describe, expect, it } from 'vitest';
import { makeFile, makeFolder } from '../test/fixtures';
import { entryPath, parentPrefix, validateEntryName } from './paths';

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
