const QUERY_PARAM = 'q';
const DEEP_PARAM = 'deep';

export interface SearchInUrl {
  search: string;
  /** The search covers the subfolders too. */
  deep: boolean;
}

/** The search typed into the address bar: `?p=docs&q=report&deep=1`. */
export function readSearchFromUrl(): SearchInUrl {
  const params = new URLSearchParams(window.location.search);
  const search = params.get(QUERY_PARAM) ?? '';
  return { search, deep: search.trim() !== '' && params.get(DEEP_PARAM) === '1' };
}

/**
 * Put the search in the address bar without adding a history entry, so the link can be shared or
 * reloaded, while Back still leaves the folder. The folder (`p`) and anything else stay as they are.
 */
export function writeSearchToUrl({ search, deep }: SearchInUrl) {
  const { pathname, search: current, hash } = window.location;
  // Edit the query string as text so the folder keeps the way it is written (slashes unescaped).
  const parts = current.replace(/^\?/, '').split('&').filter(Boolean);
  // The trash page has no search.
  if (parts.some((p) => p.startsWith('view='))) return;

  const kept = parts.filter((p) => !p.startsWith(`${QUERY_PARAM}=`) && !p.startsWith(`${DEEP_PARAM}=`));
  if (search.trim() !== '') {
    kept.push(`${QUERY_PARAM}=${encodeURIComponent(search)}`);
    if (deep) kept.push(`${DEEP_PARAM}=1`);
  }

  const next = `${pathname}${kept.length > 0 ? `?${kept.join('&')}` : ''}${hash}`;
  if (next !== `${pathname}${current}${hash}`) window.history.replaceState(null, '', next);
}
