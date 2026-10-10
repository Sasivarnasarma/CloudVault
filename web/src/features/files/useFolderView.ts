import { useEffect, useMemo, useState } from 'react';
import { sortEntries, type Entry, type SortDir, type SortKey } from '../../lib/entries';
import { categoryOf, matchesFilter, type CategoryFilter } from '../../lib/fileKind';
import type { ObjectListResponse } from '../../types';
import type { ViewMode } from './browserTypes';

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
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [view, setView] = useState<ViewMode>(loadView);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable: the preference just won't persist */
    }
  }, [view]);

  // A search belongs to the folder it was typed in, so moving to another folder clears it.
  const [searchPrefix, setSearchPrefix] = useState(currentPrefix);
  if (searchPrefix !== currentPrefix) {
    setSearchPrefix(currentPrefix);
    setSearch('');
  }

  /** Every entry of the folder, folders first, as loaded. */
  const allEntries = useMemo<Entry[]>(() => {
    if (!data) return [];
    return [
      ...data.folders.map((folder): Entry => ({ type: 'folder', id: folder.prefix, name: folder.name, folder })),
      ...data.objects.map((file): Entry => ({ type: 'file', id: file.key, name: file.name, file })),
    ];
  }, [data]);

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
    allEntries,
    entries,
    counts,
    filtered: search.trim() !== '' || filter !== 'all',
  };
}
