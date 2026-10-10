import { useCallback, useEffect, useState } from 'react';
import { urlForPrefix } from '../features/files/useObjects';

export type AppView = 'files' | 'trash';

const VIEW_PARAM = 'view';

function readView(): AppView {
  return new URLSearchParams(window.location.search).get(VIEW_PARAM) === 'trash' ? 'trash' : 'files';
}

/**
 * Which part of the app is showing: the files or the trash. It lives in the address (?view=trash),
 * so a refresh stays in the trash and the back button leaves it.
 *
 * `currentPrefix` is the folder to come back to when going from the trash to the files.
 */
export function useAppView(currentPrefix: string) {
  const [view, setView] = useState<AppView>(readView);

  useEffect(() => {
    const onPopState = () => setView(readView());
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);

  const openTrash = useCallback(() => {
    if (readView() === 'trash') return;
    const { pathname, hash } = window.location;
    window.history.pushState(null, '', `${pathname}?${VIEW_PARAM}=trash${hash}`);
    setView('trash');
  }, []);

  const openFiles = useCallback(() => {
    if (readView() !== 'trash') return;
    window.history.pushState(null, '', urlForPrefix(currentPrefix));
    setView('files');
  }, [currentPrefix]);

  return { view, openTrash, openFiles };
}
