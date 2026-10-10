import { AlertCircle, CloudUpload, RefreshCw } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Toaster, toast } from 'sonner';
import { Button } from '../components/common/Button';
import { ConfirmDialog } from '../components/common/ConfirmDialog';
import { Sidebar } from '../components/layout/Sidebar';
import { Toolbar } from '../components/layout/Toolbar';
import { EmptyFolderState } from '../features/files/EmptyFolderState';
import { BulkBar } from '../features/files/BulkBar';
import { BulkTransferDialog, type BulkTransferTarget } from '../features/files/BulkTransferDialog';
import { FileBrowser, type ViewMode } from '../features/files/FileBrowser';
import { FileSkeleton } from '../features/files/FileSkeleton';
import { Inspector } from '../features/files/Inspector';
import { LoadMore } from '../features/files/LoadMore';
import { ShortcutsDialog } from '../features/files/ShortcutsDialog';
import { TransferDialog, type TransferTarget } from '../features/files/TransferDialog';
import { CreateFolderModal } from '../features/folders/CreateFolderModal';
import { UploadTray } from '../features/upload/UploadTray';
import { useFileDrop } from '../features/upload/useFileDrop';
import {
  deleteEntry,
  describeEntries,
  runBulk,
  summarize,
  transferEntry,
  type BulkResult,
} from '../features/files/bulkActions';
import { useObjects } from '../features/files/useObjects';
import { useFileShortcuts } from '../features/files/useFileShortcuts';
import { useSelection } from '../features/files/useSelection';
import { useTheme } from '../hooks/useTheme';
import { useUpload } from '../features/upload/useUpload';
import { errorMessage } from '../lib/cn';
import { sortEntries, type Entry, type SortDir, type SortKey, type TransferMode } from '../lib/entries';
import { categoryOf, matchesFilter, type CategoryFilter } from '../lib/fileKind';
import { formatBytes } from '../lib/formatters';
import { fromDirectoryInput, type DroppedContent } from '../lib/dropEntries';
import { fetchHealthStatus } from '../services/healthService';
import { createFolder, deleteFolder } from '../services/folderService';
import { deleteObject, requestPresignedDownload } from '../services/objectService';
import { triggerBrowserDownload } from '../services/transferService';
import type { HealthResponse } from '../types';

const VIEW_KEY = 'cloudvault_view';
const INSPECTOR_WIDTH = '22rem';

function loadView(): ViewMode {
  try {
    return localStorage.getItem(VIEW_KEY) === 'list' ? 'list' : 'grid';
  } catch {
    return 'grid';
  }
}

export function FilesPage() {
  const { theme, toggleTheme } = useTheme();
  const {
    currentPrefix,
    data,
    loading,
    error,
    hasMore,
    loadingMore,
    loadMoreError,
    loadMore,
    navigateToFolder,
    navigateUp,
    refetch,
  } = useObjects();
  const {
    queue,
    isUploading,
    startUploads,
    replaceItem,
    retryItem,
    cancelItem,
    replaceConflicts,
    skipConflicts,
    dismissItem,
    clearQueue,
  } = useUpload();

  const [health, setHealth] = useState<HealthResponse | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [healthError, setHealthError] = useState(false);

  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<CategoryFilter>('all');
  const [view, setView] = useState<ViewMode>(loadView);
  const [sort, setSort] = useState<{ key: SortKey; dir: SortDir }>({ key: 'name', dir: 'asc' });

  const [navOpen, setNavOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<Entry | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [transfer, setTransfer] = useState<TransferTarget | null>(null);
  const [bulkDelete, setBulkDelete] = useState<Entry[] | null>(null);
  const [bulkDeleting, setBulkDeleting] = useState(false);
  const [bulkTransfer, setBulkTransfer] = useState<BulkTransferTarget | null>(null);
  const [dragIds, setDragIds] = useState<string[] | null>(null);
  const [movingIds, setMovingIds] = useState<string[]>([]);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);

  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const folderInputRef = useRef<HTMLInputElement>(null);
  const scanToast = useRef<{ timer: number; id?: string | number }>({ timer: 0 });

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

  const orderedIds = useMemo(() => entries.map((e) => e.id), [entries]);
  const selection = useSelection(orderedIds, currentPrefix);

  const selectedEntries = useMemo(
    () => entries.filter((e) => selection.selected.has(e.id)),
    [entries, selection.selected],
  );
  // One selected file shows its details; several items (or any folder) get the bulk bar instead.
  const selectedFile = selectedEntries.length === 1 && selectedEntries[0].type === 'file' ? selectedEntries[0].file : null;
  const bulkEntries =
    selectedEntries.length > 1 || selectedEntries.some((e) => e.type === 'folder') ? selectedEntries : [];

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

  const handleUploadContent = useCallback(
    async ({ sources, emptyFolders, skipped }: DroppedContent) => {
      if (sources.length === 0 && emptyFolders.length === 0) {
        if (skipped > 0) toast.info('Only system files were found, so nothing was uploaded.');
        return;
      }
      const base = currentPrefix ? currentPrefix.replace(/\/+$/, '') + '/' : '';
      const emptyDone = Promise.allSettled(emptyFolders.map((path) => createFolder(`${base}${path}`)));

      if (sources.length > 0) {
        await startUploads(sources, currentPrefix, async () => {
          await emptyDone;
          refetch();
        });
      } else {
        await emptyDone;
        refetch();
      }
    },
    [startUploads, currentPrefix, refetch],
  );

  const handleUploadFiles = useCallback(
    (files: File[]) => handleUploadContent({ sources: files.map((file) => ({ file })), emptyFolders: [], skipped: 0 }),
    [handleUploadContent],
  );

  const { dragging } = useFileDrop({
    onDrop: handleUploadContent,
    // Reading a big folder tree can take a while: only mention it if it does.
    onScanStart: () => {
      scanToast.current.timer = window.setTimeout(() => {
        scanToast.current.id = toast.loading('Reading folders…');
      }, 400);
    },
    onScanEnd: () => {
      window.clearTimeout(scanToast.current.timer);
      if (scanToast.current.id !== undefined) toast.dismiss(scanToast.current.id);
      scanToast.current.id = undefined;
    },
    onError: () => toast.error('Couldn’t read the dropped items.'),
  });

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
        selection.remove([pendingDelete.id]);
      }
      setPendingDelete(null);
      refetch();
    } catch (err) {
      toast.error(errorMessage(err, `Couldn’t delete ${pendingDelete.name}`));
    } finally {
      setDeleting(false);
    }
  };

  const handleTransferDone = useCallback(
    ({ mode, entry, destination }: { mode: TransferMode; entry: Entry; destination: string }) => {
      const verb = { rename: 'Renamed', move: 'Moved', copy: 'Copied' }[mode];
      const target = destination.replace(/\/+$/, '');
      toast.success(mode === 'rename' ? `${verb} to “${target.split('/').pop()}”` : `${verb} “${entry.name}” to ${target}`);
      if (mode !== 'copy') selection.remove([entry.id]);
      refetch();
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [refetch, selection.remove],
  );

  const changeSort = (key: SortKey, dir?: SortDir) => {
    setSort((prev) => ({
      key,
      dir: dir ?? (prev.key === key ? (prev.dir === 'asc' ? 'desc' : 'asc') : 'asc'),
    }));
  };

  const confirmBulkDelete = async () => {
    if (!bulkDelete) return;
    setBulkDeleting(true);
    const results = await runBulk(bulkDelete, deleteEntry);
    const { succeeded, failed } = summarize(results);
    setBulkDeleting(false);
    setBulkDelete(null);

    if (failed.length === 0) {
      toast.success(`Deleted ${describeEntries(succeeded.map((r) => r.entry))}`);
    } else {
      toast.error(`Couldn’t delete ${failed.length} of ${results.length} items`, { description: failed[0].error });
    }
    selection.replace(failed.map((r) => r.entry.id));
    refetch();
  };

  /** `toastId` is a loading toast to turn into the result, so the user sees one message from start to finish. */
  const handleBulkTransferDone = (mode: 'move' | 'copy', results: BulkResult[], toastId?: string | number) => {
    const { succeeded, failed } = summarize(results);
    const verb = mode === 'move' ? 'Moved' : 'Copied';
    let idUsed = false;
    const take = () => {
      if (idUsed) return undefined;
      idUsed = true;
      return toastId;
    };
    if (succeeded.length > 0) toast.success(`${verb} ${describeEntries(succeeded.map((r) => r.entry))}`, { id: take() });
    if (failed.length > 0) {
      const what =
        results.length === 1
          ? `“${failed[0].entry.name}”`
          : failed.length === results.length
            ? `any of the ${results.length} items`
            : `${failed.length} of ${results.length} items`;
      toast.error(`Couldn’t ${mode} ${what}`, { description: failed[0].error, id: take() });
    }
    if (toastId !== undefined && !idUsed) toast.dismiss(toastId);
    selection.replace(failed.map((r) => r.entry.id));
    refetch();
  };

  /** Entries dragged onto a folder (a tile, the path above the list, or the up button): move them there. */
  const moveDragged = async (destinationPrefix: string) => {
    const ids = dragIds ?? [];
    setDragIds(null);
    const moving = allEntries.filter((e) => ids.includes(e.id));
    if (moving.length === 0 || destinationPrefix === currentPrefix) return;

    // Show progress straight away: a spinner on the items and a loading toast that the result replaces.
    setMovingIds(moving.map((e) => e.id));
    const toastId = toast.loading(`Moving ${describeEntries(moving)}…`);
    try {
      const results = await runBulk(moving, (entry) => transferEntry(entry, 'move', destinationPrefix, false));
      handleBulkTransferDone('move', results, toastId);
    } catch (err) {
      toast.error(errorMessage(err, 'Couldn’t move the items'), { id: toastId });
    } finally {
      setMovingIds([]);
    }
  };

  const openUploadPicker = () => fileInputRef.current?.click();

  // Keyboard shortcuts (the full list is in lib/keymap.ts). The arrow keys, Enter, Space and
  // type-to-find live in the file browser itself. A handler that returns false leaves the key alone.
  const onlySelected = selectedEntries.length === 1 ? selectedEntries[0] : null;
  useFileShortcuts({
    focusSearch: () => searchRef.current?.focus(),
    goUp: () => {
      if (!currentPrefix) return false;
      navigateUp();
    },
    clearSelection: () => {
      if (selectedEntries.length === 0) return false;
      selection.clear();
    },
    selectAll: selection.selectAll,
    invertSelection: selection.invert,
    deleteSelected: () => {
      if (selectedEntries.length === 0) return false;
      setBulkDelete(selectedEntries);
    },
    rename: () => {
      if (!onlySelected) return false;
      setTransfer({ entry: onlySelected, mode: 'rename' });
    },
    download: () => {
      if (onlySelected?.type !== 'file') return false;
      void handleDownload(onlySelected.file.key, onlySelected.name);
    },
    contextMenu: () => {
      // Open the same menu a right-click would, next to the item that has the keyboard focus.
      const item = document.activeElement?.closest<HTMLElement>('[data-entry-id]');
      if (!item) return false;
      const box = item.getBoundingClientRect();
      item.dispatchEvent(
        new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: box.left + 24, clientY: box.top + 24 }),
      );
    },
    newFolder: () => setFolderDialogOpen(true),
    upload: openUploadPicker,
    uploadFolder: () => folderInputRef.current?.click(),
    refresh: () => {
      loadHealth();
      refetch();
    },
    showShortcuts: () => setShortcutsOpen(true),
  });
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
      onUploadFolder={closeNavAnd(() => folderInputRef.current?.click())}
      onNewFolder={closeNavAnd(() => setFolderDialogOpen(true))}
      onToggleTheme={toggleTheme}
      onShowShortcuts={closeNavAnd(() => setShortcutsOpen(true))}
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
          dragActive={dragIds !== null}
          onDropToPrefix={moveDragged}
        />

        <div className="relative flex min-h-0 flex-1">
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
                selection={selection.selected}
                sort={sort}
                onSortChange={changeSort}
                onOpenFolder={navigateToFolder}
                onToggleSelect={selection.toggle}
                onSelectRange={selection.selectRange}
                onSelectAll={selection.selectAll}
                onClearSelection={selection.clear}
                onChoose={selection.choose}
                onGoUp={navigateUp}
                onReachEnd={hasMore ? loadMore : undefined}
                dragIds={dragIds}
                busyIds={movingIds}
                onDragStart={setDragIds}
                onDragEnd={() => setDragIds(null)}
                onDropOnFolder={moveDragged}
                onDownload={handleDownload}
                onDelete={setPendingDelete}
                onTransfer={(entry, mode) => setTransfer({ entry, mode })}
              />
            )}
            {!loading && !error && (
              <LoadMore
                hasMore={hasMore}
                loading={loadingMore}
                error={loadMoreError}
                loadedCount={(data?.folders.length ?? 0) + (data?.objects.length ?? 0)}
                onLoadMore={loadMore}
              />
            )}
          </main>

          <BulkBar
            entries={bulkEntries}
            busy={bulkDeleting}
            onMove={() => setBulkTransfer({ mode: 'move', entries: bulkEntries })}
            onCopy={() => setBulkTransfer({ mode: 'copy', entries: bulkEntries })}
            onDelete={() => setBulkDelete(bulkEntries)}
            onClear={selection.clear}
          />

          <AnimatePresence initial={false}>
            {selectedFile && (
              <motion.aside
                key="inspector"
                aria-label="File details"
                className="fixed inset-y-0 right-0 z-30 max-w-[100vw] shrink-0 overflow-hidden border-l border-line bg-surface shadow-pop xl:static xl:z-auto xl:shadow-none"
                // Animate width (not position) so the file list reflows smoothly instead of leaving a gap.
                initial={{ width: 0, opacity: 0 }}
                animate={{ width: INSPECTOR_WIDTH, opacity: 1 }}
                exit={{ width: 0, opacity: 0 }}
                transition={{ duration: 0.2, ease: 'easeOut' }}
              >
                <div className="h-full max-w-[100vw]" style={{ width: INSPECTOR_WIDTH }}>
                  <Inspector
                    file={selectedFile}
                    bucket={health?.bucket}
                    onClose={selection.clear}
                    onDownload={handleDownload}
                    onDelete={(file) => setPendingDelete({ type: 'file', id: file.key, name: file.name, file })}
                  onTransfer={(file, mode) => setTransfer({ entry: { type: 'file', id: file.key, name: file.name, file }, mode })}
                  />
                </div>
              </motion.aside>
            )}
          </AnimatePresence>
        </div>

        <footer className="flex items-center gap-3 border-t border-line bg-surface px-5 py-2 text-xs text-ink-3">
          <span>
            {folderCount}
            {hasMore ? '+' : ''} folder{folderCount === 1 ? '' : 's'}, {fileCount}
            {hasMore ? '+' : ''} file{fileCount === 1 ? '' : 's'}
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

      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '' } as object)}
        className="hidden"
        aria-hidden="true"
        aria-label="Upload folder"
        tabIndex={-1}
        onChange={(e) => {
          handleUploadContent(fromDirectoryInput(Array.from(e.target.files ?? [])));
          e.target.value = '';
        }}
      />

      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

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

      <ConfirmDialog
        open={!!bulkDelete}
        loading={bulkDeleting}
        title={bulkDelete?.length === 1 ? `Delete “${bulkDelete[0].name}”?` : `Delete ${bulkDelete?.length ?? 0} items?`}
        description={`${bulkDelete?.length === 1 ? `“${bulkDelete[0].name}”` : describeEntries(bulkDelete ?? [])} will be permanently deleted${
          bulkDelete?.some((e) => e.type === 'folder') ? ', including everything inside the folders' : ''
        }. This can’t be undone.`}
        confirmLabel="Delete"
        onConfirm={confirmBulkDelete}
        onCancel={() => setBulkDelete(null)}
      />

      <BulkTransferDialog
        target={bulkTransfer}
        startPrefix={currentPrefix}
        onClose={() => setBulkTransfer(null)}
        onDone={handleBulkTransferDone}
      />

      <TransferDialog
        target={transfer}
        startPrefix={currentPrefix}
        onClose={() => setTransfer(null)}
        onDone={handleTransferDone}
      />

      <UploadTray
        queue={queue}
        isUploading={isUploading}
        onClear={clearQueue}
        onReplace={(item) => replaceItem(item, refetch)}
        onSkip={dismissItem}
        onCancel={cancelItem}
        onRetry={(item) => retryItem(item, refetch)}
        onReplaceAll={() => replaceConflicts(refetch)}
        onSkipAll={skipConflicts}
      />

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
        position="top-center"
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
