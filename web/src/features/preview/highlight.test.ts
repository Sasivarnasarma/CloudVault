import { describe, expect, it } from 'vitest';
import { highlight, languageFor } from './highlight';

describe('languageFor', () => {
  it('knows the language of a file from its extension, in any case', () => {
    expect(languageFor('main.py')).toBe('python');
    expect(languageFor('App.TSX')).toBe('typescript');
    expect(languageFor('index.mjs')).toBe('javascript');
    expect(languageFor('deploy.sh')).toBe('bash');
    expect(languageFor('config.toml')).toBe('ini');
    expect(languageFor('page.html')).toBe('xml');
    expect(languageFor('data.json')).toBe('json');
  });

  it('has none for plain text, logs and files without an extension', () => {
    expect(languageFor('notes.txt')).toBeNull();
    expect(languageFor('server.log')).toBeNull();
    expect(languageFor('data.csv')).toBeNull();
    expect(languageFor('Makefile')).toBeNull();
  });
});

describe('highlight', () => {
  it('wraps the parts of the syntax in tags that the styles colour', async () => {
    const html = await highlight('def greet(name):\n    return "hi"  # say hello\n', 'python');
    expect(html).toContain('<span class="hljs-keyword">def</span>');
    expect(html).toContain('<span class="hljs-string">&quot;hi&quot;</span>');
    expect(html).toContain('<span class="hljs-comment"># say hello</span>');
  });

  it('escapes the code, so a file cannot put markup in the page', async () => {
    const html = await highlight('<script>alert(1)</script><img src=x onerror=alert(2)>', 'xml');
    expect(html).not.toContain('<script>');
    expect(html).not.toContain('<img');
    expect(html).toContain('&lt;');
  });

  it('can colour several languages, one after another', async () => {
    expect(await highlight('{"a": 1}', 'json')).toContain('hljs-');
    expect(await highlight('SELECT * FROM t;', 'sql')).toContain('hljs-keyword');
    expect(await highlight('fn main() {}', 'rust')).toContain('hljs-keyword');
  });

  it('refuses a language it does not have', async () => {
    await expect(highlight('x', 'cobol')).rejects.toThrow('No highlighting');
  });
});
