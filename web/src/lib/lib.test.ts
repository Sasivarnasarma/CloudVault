import { afterEach, describe, expect, it, vi } from 'vitest';
import { makeFile, makeFolder } from '../test/fixtures';
import { cn, errorMessage } from './cn';
import { sortEntries, type Entry } from './entries';
import { categoryOf, extensionOf, kindLabel, matchesFilter } from './fileKind';
import { formatBytes, formatDate, formatRelativeDate } from './formatters';

describe('cn / errorMessage', () => {
  it('merges conflicting tailwind classes and drops falsy values', () => {
    const hidden = false as boolean;
    expect(cn('px-2 py-1', hidden && 'hidden', 'px-4')).toBe('py-1 px-4');
  });

  it('uses the message of real errors and the fallback otherwise', () => {
    expect(errorMessage(new Error('boom'), 'fallback')).toBe('boom');
    expect(errorMessage(new Error(''), 'fallback')).toBe('fallback');
    expect(errorMessage('nope', 'fallback')).toBe('fallback');
    expect(errorMessage(undefined, 'fallback')).toBe('fallback');
  });
});

describe('fileKind', () => {
  it('extracts lowercase extensions and ignores dotfiles', () => {
    expect(extensionOf('Report.PDF')).toBe('pdf');
    expect(extensionOf('archive.tar.gz')).toBe('gz');
    expect(extensionOf('.gitignore')).toBe('');
    expect(extensionOf('README')).toBe('');
  });

  it.each([
    ['photo.jpg', 'image/jpeg', 'images'],
    ['photo.unknown', 'image/png', 'images'],
    ['song.mp3', 'audio/mpeg', 'media'],
    ['clip.bin', 'video/mp4', 'media'],
    ['backup.zip', 'application/zip', 'archives'],
    ['app.ts', 'application/octet-stream', 'code'],
    ['server.log', 'text/plain', 'code'],
    ['report.pdf', 'application/pdf', 'documents'],
    ['notes', 'text/markdown', 'documents'],
    ['mystery.xyz', 'application/octet-stream', 'other'],
  ] as const)('categorizes %s (%s) as %s', (name, content_type, expected) => {
    expect(categoryOf({ name, content_type })).toBe(expected);
  });

  it('labels files by extension', () => {
    expect(kindLabel({ name: 'a.md' })).toBe('MD');
    expect(kindLabel({ name: 'LICENSE' })).toBe('File');
  });

  it('matches the all filter for everything and category filters selectively', () => {
    const image = makeFile('a.png', { content_type: 'image/png' });
    const doc = makeFile('a.pdf', { content_type: 'application/pdf' });
    expect(matchesFilter(image, 'all')).toBe(true);
    expect(matchesFilter(image, 'images')).toBe(true);
    expect(matchesFilter(doc, 'images')).toBe(false);
    expect(matchesFilter(doc, 'documents')).toBe(true);
  });
});

describe('sortEntries', () => {
  const folder = (name: string): Entry => ({ type: 'folder', id: name + '/', name, folder: makeFolder(name) });
  const file = (name: string, size: number, modified: string): Entry => ({
    type: 'file',
    id: name,
    name,
    file: makeFile(name, { size, last_modified: modified }),
  });

  const entries = [
    file('b.txt', 300, '2026-01-02T00:00:00Z'),
    folder('zeta'),
    file('a.txt', 100, '2026-01-03T00:00:00Z'),
    folder('alpha'),
    file('c10.txt', 200, '2026-01-01T00:00:00Z'),
    file('c2.txt', 50, '2026-01-04T00:00:00Z'),
  ];
  const names = (list: Entry[]) => list.map((e) => e.name);

  it('keeps folders first and sorts names naturally', () => {
    expect(names(sortEntries(entries, 'name', 'asc'))).toEqual([
      'alpha',
      'zeta',
      'a.txt',
      'b.txt',
      'c2.txt',
      'c10.txt',
    ]);
  });

  it('reverses both groups for descending names', () => {
    expect(names(sortEntries(entries, 'name', 'desc'))).toEqual([
      'zeta',
      'alpha',
      'c10.txt',
      'c2.txt',
      'b.txt',
      'a.txt',
    ]);
  });

  it('sorts files by size and modified date while folders stay alphabetical', () => {
    expect(names(sortEntries(entries, 'size', 'asc'))).toEqual([
      'alpha',
      'zeta',
      'c2.txt',
      'a.txt',
      'c10.txt',
      'b.txt',
    ]);
    expect(names(sortEntries(entries, 'modified', 'desc'))).toEqual([
      'alpha',
      'zeta',
      'c2.txt',
      'a.txt',
      'b.txt',
      'c10.txt',
    ]);
  });

  it('does not mutate its input', () => {
    const copy = [...entries];
    sortEntries(entries, 'size', 'desc');
    expect(entries).toEqual(copy);
  });
});

describe('formatters', () => {
  it('formats byte sizes', () => {
    expect(formatBytes(0)).toBe('0 Bytes');
    expect(formatBytes(512)).toBe('512 Bytes');
    expect(formatBytes(1536)).toBe('1.5 KB');
    expect(formatBytes(1024 ** 2)).toBe('1 MB');
    expect(formatBytes(5 * 1024 ** 3, 1)).toBe('5 GB');
  });

  it('formats dates and tolerates empty input', () => {
    expect(formatDate('')).toBe('—');
    expect(formatDate('2026-03-05T14:30:00Z')).toMatch(/2026/);
  });

  describe('formatRelativeDate', () => {
    afterEach(() => vi.useRealTimers());

    it('uses relative wording for recent dates', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      expect(formatRelativeDate('2026-06-15T11:59:50Z')).toBe('Just now');
      expect(formatRelativeDate('2026-06-15T11:30:00Z')).toBe('30 minutes ago');
      expect(formatRelativeDate('2026-06-15T09:00:00Z')).toBe('3 hours ago');
      expect(formatRelativeDate('2026-06-14T12:00:00Z')).toBe('yesterday');
    });

    it('falls back to an absolute date for old or invalid values', () => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date('2026-06-15T12:00:00Z'));
      expect(formatRelativeDate('2025-01-02T12:00:00Z')).toMatch(/2025/);
      expect(formatRelativeDate('not a date')).toBe('—');
    });
  });
});
