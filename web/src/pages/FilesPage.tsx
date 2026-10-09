import { AlertCircle, CloudUpload, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Sidebar } from '../components/layout/Sidebar';
import { Toolbar } from '../components/layout/Toolbar';
import { EmptyFolderState } from '../features/files/EmptyFolderState';
import { FileBrowser, type ViewMode } from '../features/files/FileBrowser';
import { FileSkeleton } from '../features/files/FileSkeleton';
import { Inspector } from '../features/files/Inspector';
import { CreateFolderModal } from '../features/folders/CreateFolderModal';
import { UploadTray } from '../features/upload/UploadTray';
import { useObjects } from '../features/files/useObjects';
import { useTheme } from '../hooks/useTheme';
import { useUpload } from '../features/upload/useUpload';
import { errorMessage } from '../lib/cn';
import { sortEntries, type Entry, type SortDir, type SortKey } from '../lib/entries';
import { categoryOf, matchesFilter, type CategoryFilter } from '../lib/fileKind';
import { formatBytes } from '../lib/formatters';
import { fetchHealthStatus } from '../services/healthService';
import { deleteFolder } from '../services/folderService';
import { deleteObject, requestPresignedDownload } from '../services/objectService';
import { triggerBrowserDownload } from '../services/transferService';
import type { HealthResponse } from '../types';

const VIEW_KEY = 'cloudvault_view';

function loadView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

function hasFiles(e: DragEvent): boolean {
  return Array.from(e.dataTransfer?.types ?? []).includes('Files');
}

export function FilesPage() {
  const { theme, toggleTheme } = useTheme();
  const { currentPrefix, data, loading, error, navigateToFolder, navigateUp, refetch } = useObjects();
  const { queue, isUploading, startUploads, clearQueue } = useUpload();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [view, setView] = useState<ViewMode>(loadView);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [navOpen, setNavOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [dragging, setDragging] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const dragDepth = useRef(0);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError(false);
    try {
      setHealth(await fetchHealthStatus());
    } catch {
      setHealthError(true);
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    loadHealth();
  }, [loadHealth]);

  useEffect(() => {
    try {
      localStorage.setItem(VIEW_KEY, view);
    } catch {
      /* storage unavailable: preference just won't persist */
    }
  }, [view]);

  // Reset transient state when moving between folders.
  useEffect(() => {
    setSelectedId(null);
    setSearch('');
  }, [currentPrefix]);

  const allEntries = useMemo<Entry[]>(() => {
    if (!data) return [];
    return [
      ...data.folders.map((folder): Entry => ({ type: 'folder', id: folder.prefix, name: folder.name, folder })),
      ...data.objects.map((file): Entry => ({ type: 'file', id: file.key, name: file.name, file })),
    ];
  }, [data]);

  const entries = useMemo(() => {
    const q = search.trim().toLowerCase();
    const visible = allEntries.filter((e) => {
      if (q && !e.name.toLowerCase().includes(q)) return false;
      return e.type === 'folder' || matchesFilter(e.file, filter);
    });
    return sortEntries(visible, sort.key, sort.dir);
  }, [allEntries, search, filter, sort]);

  const counts = useMemo<Record<CategoryFilter, number>>(() => {
    const files = data?.objects ?? [];
    const count = (c: CategoryFilter) => files.filter((f) => categoryOf(f) === c).length;
    return { all: files.length, documents: count('documents'), images: count('images'), media: count('media') };
  }, [data]);

  const selectedFile = useMemo(() => {
    const entry = allEntries.find((e) => e.id === selectedId);
    return entry?.type === 'file' ? entry.file : null;
  }, [allEntries, selectedId]);

  const filtered = search.trim() !== '' || filter !== 'all';

  const handleDownload = useCallback(async (key: string, name: string) => {
    try {
      const res = await requestPresignedDownload(key, name);
      triggerBrowserDownload(res.download_url);
      toast.success(`Downloading ${name}`);
    } catch (err) {
      toast.error(errorMessage(err, `Couldn’t download ${name}`));
    }
  }, []);

  const handleUploadFiles = useCallback(
    (files: File[]) => {
      if (files.length === 0) return;
      if (isUploading) {
        toast.info('Wait for the current uploads to finish.');
        return;
      }
      startUploads(files, currentPrefix, () => {
        refetch();
      });
    },
    [isUploading, startUploads, currentPrefix, refetch],
  );

  const confirmDelete = async () => {
    if (!pendingDelete) return;
    setDeleting(true);
    try {
      if (pendingDelete.type === 'folder') {
        const res = await deleteFolder(pendingDelete.folder.prefix);
        toast.success(`Deleted “${pendingDelete.name}” (${res.deleted_count} items)`);
      } else {
        await deleteObject(pendingDelete.file.key);
        toast.success(`Deleted “${pendingDelete.name}”`);
        if (selectedId === pendingDelete.id) setSelectedId(null);
      }
      setPendingDelete(null);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, `Couldn’t delete ${pendingDelete.name}`));
    } finally {
      setDeleting(false);
    }
  };

  const changeSort = (key: SortKey, dir?: SortDir) => {
    setSort((prev) => ({
      key,
      dir: dir ?? (prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc'),
    }));
  };

  // Window-level drag & drop upload.
  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current += 1;
      setDragging(true);
    };
    const onLeave = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      dragDepth.current = Math.max(0, dragDepth.current - 1);
      if (dragDepth.current === 0) setDragging(false);
    };
    const onOver = (e: DragEvent) => {
      if (hasFiles(e)) e.preventDefault();
    };
    const onDrop = (e: DragEvent) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      dragDepth.current = 0;
      setDragging(false);
      const items = Array.from(e.dataTransfer?.items ?? []);
      const files: File[] = [];
      let skippedFolder = false;
      for (const item of items) {
        if (item.kind !== 'file') continue;
        if (item.webkitGetAsEntry?.()?.isDirectory) {
          skippedFolder = true;
          continue;
        }
        const file = item.getAsFile();
        if (file) files.push(file);
      }
      if (skippedFolder) toast.info('Folders can’t be uploaded yet. Only files were added.');
      handleUploadFiles(files);
    };
    window.addEventListener('dragenter', onEnter);
    window.addEventListener('dragleave', onLeave);
    window.addEventListener('dragover', onOver);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragenter', onEnter);
      window.removeEventListener('dragleave', onLeave);
      window.removeEventListener('dragover', onOver);
      window.removeEventListener('drop', onDrop);
    };
  }, [handleUploadFiles]);

  // Keyboard: "/" focuses search, Escape closes the inspector.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      if (e.key === '/' && !typing) {
        e.preventDefault();
        searchRef.current?.focus();
      } else if (e.key === 'Escape' && !typing) {
        setSelectedId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const openUploadPicker = () => fileInputRef.current?.click();
  const closeNavAnd = (fn: () => void) => () => {
    setNavOpen(false);
    fn();
  };

  const sidebar = (
    <Sidebar
      health={health}
      healthLoading={healthLoading}
      healthError={healthError}
      filter={filter}
      counts={counts}
      theme={theme}
      onFilterChange={(f) => {
        setFilter(f);
        setNavOpen(false);
      }}
      onUpload={closeNavAnd(openUploadPicker)}
      onNewFolder={closeNavAnd(() => setFolderDialogOpen(true))}
      onToggleTheme={toggleTheme}
      onNavigateHome={closeNavAnd(() => navigateToFolder(''))}
    />
  );

  const folderCount = data?.folders.length ?? 0;
  const fileCount = data?.objects.length ?? 0;

  return (
    <div className="flex h-full bg-canvas text-ink">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>

      <AnimatePresence>
        {navOpen && (
          <>
            <motion.div
              className="fixed inset-0 z-40 bg-ink/40 backdrop-blur-[3px] lg:hidden"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              onClick={() => setNavOpen(false)}
            />
            <motion.aside
              className="fixed inset-y-0 left-0 z-50 w-72 border-r border-line bg-surface shadow-pop lg:hidden"
              initial={{ x: '-100%' }}
              animate={{ x: 0 }}
              exit={{ x: '-100%' }}
              transition={{ type: 'spring', stiffness: 400, damping: 40 }}
            >
              {sidebar}
            </motion.aside>
          </>
        )}
      </AnimatePresence>

      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          currentPrefix={currentPrefix}
          rootLabel="All files"
          search={search}
          searchRef={searchRef}
          view={view}
          sort={sort}
          refreshing={loading || healthLoading}
          onNavigate={navigateToFolder}
          onNavigateUp={navigateUp}
          onSearchChange={setSearch}
          onViewChange={setView}
          onSortChange={changeSort}
          onRefresh={() => {
            loadHealth();
            refetch();
          }}
          onOpenNav={() => setNavOpen(true)}
        />

        <div className="flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto" aria-busy={loading}>
            {error ? (
              <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
                <div className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-danger-soft text-danger">
                  <AlertCircle className="size-7" />
                </div>
                <h2 className="text-base font-semibold">Unable to load files</h2>
                <p className="mt-1 max-w-sm text-sm text-ink-3">{error}</p>
                <Button className="mt-5" onClick={() => refetch()}>
                  <RefreshCw className="size-4" />
                  Try again
                </Button>
              </div>
            ) : loading ? (
              <FileSkeleton view={view} />
            ) : entries.length === 0 ? (
              <EmptyFolderState
                filtered={filtered}
                onClearFilters={() => {
                  setSearch('');
                  setFilter('all');
                }}
              />
            ) : (
              <FileBrowser
                key={`${currentPrefix}|${view}`}
                entries={entries}
                view={view}
                selectedId={selectedId}
                sort={sort}
                onSortChange={changeSort}
                onOpenFolder={navigateToFolder}
                onSelectFile={(id) => setSelectedId((cur) => (cur === id ? null : id))}
                onDownload={handleDownload}
                onDelete={setPendingDelete}
              />
            )}
          </main>

          <AnimatePresence initial={false}>
            {selectedFile && (
              <motion.aside
                key="inspector"
                aria-label="File details"
                className="fixed inset-y-0 right-0 z-30 w-[min(22rem,100vw)] overflow-hidden border-l border-line bg-surface shadow-pop xl:static xl:z-auto xl:shadow-none"
                initial={{ x: 40, opacity: 0 }}
                animate={{ x: 0, opacity: 1 }}
                exit={{ x: 40, opacity: 0 }}
                transition={{ type: 'spring', stiffness: 420, damping: 38 }}
              >
                <Inspector
                  file={selectedFile}
                  bucket={health?.bucket}
                  onClose={() => setSelectedId(null)}
                  onDownload={handleDownload}
                  onDelete={(file) => setPendingDelete({ type: 'file', id: file.key, name: file.name, file })}
                />
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        <footer className="flex items-center gap-3 border-t border-line bg-surface px-5 py-2 text-xs text-ink-3">
          <span>
            {folderCount} folder{folderCount === 1 ? '' : 's'}, {fileCount} file{fileCount === 1 ? '' : 's'}
          </span>
          <span aria-hidden="true">·</span>
          <span className="font-mono">{formatBytes(data?.total_size ?? 0, 1)}</span>
          {filtered && !loading && <span className="ml-auto">{entries.length} shown</span>}
        </footer>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          handleUploadFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />

      <CreateFolderModal
        isOpen={folderDialogOpen}
        onClose={() => setFolderDialogOpen(false)}
        targetPrefix={currentPrefix}
        onFolderCreated={(name) => {
          toast.success(`Created folder “${name}”`);
          refetch();
        }}
      />

      <ConfirmDialog
        open={!!pendingDelete}
        loading={deleting}
        title={pendingDelete?.type === 'folder' ? 'Delete folder?' : 'Delete file?'}
        description={
          pendingDelete?.type === 'folder'
            ? `“${pendingDelete.name}” and everything inside it will be permanently deleted.`
            : `“${pendingDelete?.name ?? ''}” will be permanently deleted. This can’t be undone.`
        }
        confirmLabel="Delete"
        onConfirm={confirmDelete}
        onCancel={() => setPendingDelete(null)}
      />

      <UploadTray queue={queue} isUploading={isUploading} onClear={clearQueue} />

      <AnimatePresence>
        {dragging && (
          <motion.div
            className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center bg-accent/10 p-6 backdrop-blur-[2px]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <div className="flex h-full w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-surface/80">
              <CloudUpload className="mb-3 size-12 text-accent" strokeWidth={1.5} />
              <p className="text-lg font-semibold">Drop to upload</p>
              <p className="mt-1 text-sm text-ink-3">Files go to {currentPrefix || 'the root folder'}</p>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <Toaster
        theme={theme}
        position="bottom-left"
        toastOptions={{
          style: {
            background: 'var(--surface-2)',
            color: 'var(--ink)',
            border: '1px solid var(--line)',
            fontFamily: 'var(--font-sans)',
          },
        }}
      />
    </div>
  );
}

export default FilesPage;
