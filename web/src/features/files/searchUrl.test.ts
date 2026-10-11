import { afterEach, describe, expect, it } from 'vitest';
import { readSearchFromUrl, writeSearchToUrl } from './searchUrl';

const at = (url: string) => window.history.replaceState(null, '', url);
const current = () => window.location.pathname + window.location.search + window.location.hash;

afterEach(() => at('/'));

describe('search in the address', () => {
  it('reads the search and whether it covers the subfolders', () => {
    at('/?p=docs&q=annual%20report&deep=1');
    expect(readSearchFromUrl()).toEqual({ search: 'annual report', deep: true });
    at('/?q=report');
    expect(readSearchFromUrl()).toEqual({ search: 'report', deep: false });
    at('/?p=docs');
    expect(readSearchFromUrl()).toEqual({ search: '', deep: false });
  });

  it('ignores the subfolder flag when there is nothing to search for', () => {
    at('/?deep=1');
    expect(readSearchFromUrl().deep).toBe(false);
  });

  it('adds the search after the folder, leaving the folder as it was written', () => {
    at('/?p=docs/2025');
    writeSearchToUrl({ search: 'a b&c', deep: true });
    expect(current()).toBe('/?p=docs/2025&q=a%20b%26c&deep=1');
  });

  it('updates and removes the search', () => {
    at('/?p=docs&q=old&deep=1#x');
    writeSearchToUrl({ search: 'new', deep: false });
    expect(current()).toBe('/?p=docs&q=new#x');
    writeSearchToUrl({ search: '  ', deep: true });
    expect(current()).toBe('/?p=docs#x');
    writeSearchToUrl({ search: '', deep: false });
    expect(current()).toBe('/?p=docs#x');
  });

  it('does not add a history entry', () => {
    const before = window.history.length;
    writeSearchToUrl({ search: 'x', deep: false });
    expect(window.history.length).toBe(before);
  });

  it('leaves the trash page alone', () => {
    at('/?view=trash');
    writeSearchToUrl({ search: 'x', deep: true });
    expect(current()).toBe('/?view=trash');
  });
});
