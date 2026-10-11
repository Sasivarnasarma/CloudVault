import { useEffect, useMemo, useState } from 'react';
import { sortEntries, type Entry, type SortDir, type SortKey } from '../../lib/entries';
import { categoryOf, matchesFilter, type CategoryFilter } from '../../lib/fileKind';
import { parentPrefix } from '../../lib/paths';
import type { ObjectListResponse } from '../../types';
import type { ViewMode } from './browserTypes';
import { readSearchFromUrl, writeSearchToUrl } from './searchUrl';
import { useDeepSearch } from './useDeepSearch';

const VIEW_KEY = 'cloudvault_view';

function loadView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

/**
 * How the current folder is shown: the search text, category filter, sort order and grid/list
 * view, and the entries that result from them. The view mode is remembered between visits.
 */
export function useFolderView(data: ObjectListResponse | null, currentPrefix: string) {
  const [initialSearch] = useState(readSearchFromUrl);
  const [search, setSearch] = useState(initialSearch.search);
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [view, setView] = useState<ViewMode>(loadView);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });
  /** The search covers the subfolders too, not just this folder. */
  const [deep, setDeep] = useState(initialSearch.deep);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable: the preference just won't persist */
    }
  }, [view]);

  // A search belongs to the folder it was typed in, so moving to another folder clears it. (The
  // address already says what the search is: empty after a click, or the old one after Back.)
  const [searchPrefix, setSearchPrefix] = useState(currentPrefix);
  if (searchPrefix !== currentPrefix) {
    const inUrl = readSearchFromUrl();
    setSearchPrefix(currentPrefix);
    setSearch(inUrl.search);
    setDeep(inUrl.deep);
  }

  // Keep the address in step with the search, so it can be shared or reloaded.
  useEffect(() => {
    writeSearchToUrl({ search, deep });
  });

  const found = useDeepSearch(currentPrefix, search, deep, data);

  /** Every entry of the folder, folders first, as loaded. */
  const allEntries = useMemo<Entry[]>(() => {
    // Searching the subfolders replaces the folder's own entries with what was found below it.
    const source = found.active ? found.response : data;
    if (!source) return [];
    /** The folder an item is in, as a path below the one being viewed. */
    const whereIs = (path: string) =>
      found.active ? parentPrefix(path).slice(currentPrefix.length).replace(/\/$/, '') : undefined;
    return [
      ...source.folders.map((folder): Entry => ({
        type: 'folder',
        id: folder.prefix,
        name: folder.name,
        folder,
        where: whereIs(folder.prefix),
      })),
      ...source.objects.map((file): Entry => ({
        type: 'file',
        id: file.key,
        name: file.name,
        file,
        where: whereIs(file.key),
      })),
    ];
  }, [data, found.active, found.response, currentPrefix]);

  /** The entries that match the search and filter, in sort order. */
  const entries = useMemo(() => {
    const query = search.trim().toLowerCase();
    const visible = allEntries.filter((e) => {
      if (query && !e.name.toLowerCase().includes(query)) return false;
      return e.type === 'folder' || matchesFilter(e.file, filter);
    });
    return sortEntries(visible, sort.key, sort.dir);
  }, [allEntries, search, filter, sort]);

  const counts = useMemo<Record<CategoryFilter, number>>(() => {
    const files = data?.objects ?? [];
    const count = (c: CategoryFilter) => files.filter((f) => categoryOf(f) === c).length;
    return { all: files.length, documents: count('documents'), images: count('images'), media: count('media') };
  }, [data]);

  /** Sort by a column; choosing the column that is already sorted flips the direction. */
  const changeSort = (key: SortKey, dir?: SortDir) => {
    setSort((prev) => ({
      key,
      dir: dir ?? (prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc'),
    }));
  };

  return {
    search,
    setSearch,
    filter,
    setFilter,
    view,
    setView,
    sort,
    changeSort,
    deep,
    setDeep,
    deepSearch: found,
    allEntries,
    entries,
    counts,
    filtered: search.trim() !== '' || filter !== 'all',
  };
}
