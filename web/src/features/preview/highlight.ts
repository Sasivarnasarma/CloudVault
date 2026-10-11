import type { HLJSApi, LanguageFn } from 'highlight.js';
import { extensionOf } from '../../lib/fileKind';

/**
 * Each language is its own small chunk, fetched the first time a file of that kind is previewed, so
 * the highlighter costs nothing until it is used.
 */
const LANGUAGES: Record<string, () => Promise<{ default: LanguageFn }>> = {
  bash: () => import('highlight.js/lib/languages/bash'),
  c: () => import('highlight.js/lib/languages/c'),
  cpp: () => import('highlight.js/lib/languages/cpp'),
  css: () => import('highlight.js/lib/languages/css'),
  go: () => import('highlight.js/lib/languages/go'),
  ini: () => import('highlight.js/lib/languages/ini'),
  java: () => import('highlight.js/lib/languages/java'),
  javascript: () => import('highlight.js/lib/languages/javascript'),
  json: () => import('highlight.js/lib/languages/json'),
  markdown: () => import('highlight.js/lib/languages/markdown'),
  python: () => import('highlight.js/lib/languages/python'),
  rust: () => import('highlight.js/lib/languages/rust'),
  sql: () => import('highlight.js/lib/languages/sql'),
  typescript: () => import('highlight.js/lib/languages/typescript'),
  xml: () => import('highlight.js/lib/languages/xml'),
  yaml: () => import('highlight.js/lib/languages/yaml'),
};

const BY_EXTENSION: Record<string, string> = {
  sh: 'bash',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  css: 'css',
  go: 'go',
  ini: 'ini',
  conf: 'ini',
  toml: 'ini',
  java: 'java',
  js: 'javascript',
  mjs: 'javascript',
  jsx: 'javascript',
  json: 'json',
  md: 'markdown',
  markdown: 'markdown',
  py: 'python',
  rs: 'rust',
  sql: 'sql',
  ts: 'typescript',
  tsx: 'typescript',
  html: 'xml',
  htm: 'xml',
  xml: 'xml',
  yml: 'yaml',
  yaml: 'yaml',
};

/** The highlighter's name for the language of a file, or null when it has no syntax to colour. */
export function languageFor(fileName: string): string | null {
  return BY_EXTENSION[extensionOf(fileName)] ?? null;
}

let core: Promise<HLJSApi> | null = null;
const registered = new Set<string>();

/**
 * The code as HTML with its syntax in `<span class="hljs-…">` tags. highlight.js escapes the code
 * itself, so the result is safe to insert as it is.
 */
export async function highlight(code: string, language: string): Promise<string> {
  const load = LANGUAGES[language];
  if (!load) throw new Error(`No highlighting for ${language}`);
  core ??= import('highlight.js/lib/core').then((m) => m.default);
  const hljs = await core;
  if (!registered.has(language)) {
    hljs.registerLanguage(language, (await load()).default);
    registered.add(language);
  }
  return hljs.highlight(code, { language, ignoreIllegals: true }).value;
}
