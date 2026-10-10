import { useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { AppToaster } from '../components/layout/AppToaster';
import { MobileDrawer } from '../components/layout/MobileDrawer';
import { Sidebar } from '../components/layout/Sidebar';
import { Toolbar } from '../components/layout/Toolbar';
import { BulkBar } from '../features/files/BulkBar';
import { BulkTransferDialog } from '../features/files/BulkTransferDialog';
import { ClipboardBar } from '../features/files/ClipboardBar';
import { DeleteDialog } from '../features/files/DeleteDialog';
import { downloadFile } from '../features/files/downloadFile';
import { FileBrowser } from '../features/files/FileBrowser';
import { InspectorPanel } from '../features/files/InspectorPanel';
import { ListingState } from '../features/files/ListingState';
import { LoadMore } from '../features/files/LoadMore';
import { ShortcutsDialog } from '../features/files/ShortcutsDialog';
import { StatusBar } from '../features/files/StatusBar';
import { TransferDialog } from '../features/files/TransferDialog';
import { useClipboard } from '../features/files/useClipboard';
import { useDeleteActions } from '../features/files/useDeleteActions';
import { useDragMove } from '../features/files/useDragMove';
import { useFileShortcuts } from '../features/files/useFileShortcuts';
import { useFolderView } from '../features/files/useFolderView';
import { useObjects } from '../features/files/useObjects';
import { useSelection } from '../features/files/useSelection';
import { useTransfers } from '../features/files/useTransfers';
import { useZipDownload } from '../features/files/useZipDownload';
import { CreateFolderModal } from '../features/folders/CreateFolderModal';
import { DropOverlay } from '../features/upload/DropOverlay';
import { UploadPickers } from '../features/upload/UploadPickers';
import { UploadTray } from '../features/upload/UploadTray';
import { useFolderUploads } from '../features/upload/useFolderUploads';
import { useHealth } from '../hooks/useHealth';
import { useTheme } from '../hooks/useTheme';
import { folderLabel } from '../lib/paths';

const ROOT_LABEL = 'All files';

/** The file manager: wires the listing, selection, actions and dialogs together. */
export function FilesPage() {
  const { theme, toggleTheme } = useTheme();
  const health = useHealth();
  const listing = useObjects();
  const { currentPrefix, data, navigateToFolder, navigateUp, refetch } = listing;

  const view = useFolderView(data, currentPrefix);
  const selection = useSelection(
    useMemo(() => view.entries.map((e) => e.id), [view.entries]),
    currentPrefix,
  );

  const [navOpen, setNavOpen] = useState(false);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const selected = useMemo(
    () => view.entries.filter((e) => selection.selected.has(e.id)),
    [view.entries, selection.selected],
  );
  // One selected file shows its details; several items (or any folder) get the bulk bar instead.
  const onlySelected = selected.length === 1 ? selected[0] : null;
  const selectedFile = onlySelected?.type === 'file' ? onlySelected.file : null;
  const bulkEntries = selected.length > 1 || selected.some((e) => e.type === 'folder') ? selected : [];

  const refresh = () => {
    health.reload();
    refetch();
  };

  const uploads = useFolderUploads(currentPrefix, refetch);
  const deletes = useDeleteActions({ onDeleted: selection.remove, onRefresh: refetch });
  const transfers = useTransfers({ selection, onRefresh: refetch });
  const drag = useDragMove({ entries: view.allEntries, currentPrefix, run: transfers.run });
  const zip = useZipDownload();
  const clipboard = useClipboard({ selected, entries: view.allEntries, currentPrefix, transfers });

  // Keyboard shortcuts (the full list is in lib/keymap.ts). The arrow keys, Enter, Space and
  // type-to-find live in the file browser itself. A handler that returns false leaves the key alone.
  useFileShortcuts({
    focusSearch: () => searchRef.current?.focus(),
    goUp: () => {
      if (!currentPrefix) return false;
      navigateUp();
    },
    clearSelection: () => {
      if (selected.length > 0) selection.clear();
      else if (clipboard.clipboard)
        clipboard.clear(); // a second Escape forgets what was cut or copied
      else return false;
    },
    copy: clipboard.copy,
    cut: clipboard.cut,
    paste: () => {
      if (!clipboard.clipboard) return false;
      void clipboard.paste();
    },
    selectAll: selection.selectAll,
    invertSelection: selection.invert,
    deleteSelected: () => {
      if (selected.length === 0) return false;
      deletes.request(selected);
    },
    rename: () => {
      if (!onlySelected) return false;
      transfers.openTransfer({ entry: onlySelected, mode: 'rename' });
    },
    download: () => {
      if (selected.length === 0) return false;
      // One file downloads as it is; folders and several items come as a zip.
      if (onlySelected?.type === 'file') void downloadFile(onlySelected.file.key, onlySelected.name);
      else void zip.download(selected);
    },
    contextMenu: () => {
      // Open the same menu a right-click would, next to the item that has the keyboard focus.
      const item = document.activeElement?.closest<HTMLElement>('[data-entry-id]');
      if (!item) return false;
      const box = item.getBoundingClientRect();
      item.dispatchEvent(
        new MouseEvent('contextmenu', {
          bubbles: true,
          cancelable: true,
          clientX: box.left + 24,
          clientY: box.top + 24,
        }),
      );
    },
    newFolder: () => setFolderDialogOpen(true),
    upload: uploads.openFilePicker,
    uploadFolder: uploads.openFolderPicker,
    refresh,
    showShortcuts: () => setShortcutsOpen(true),
  });

  /** An action from the sidebar, which also closes it when it is the slide-in drawer on a small screen. */
  const fromSidebar = (action: () => void) => () => {
    setNavOpen(false);
    action();
  };

  const sidebar = (
    <Sidebar
      health={health.health}
      healthLoading={health.loading}
      healthError={health.error}
      filter={view.filter}
      counts={view.counts}
      theme={theme}
      onFilterChange={(f) => {
        view.setFilter(f);
        setNavOpen(false);
      }}
      onUpload={fromSidebar(uploads.openFilePicker)}
      onUploadFolder={fromSidebar(uploads.openFolderPicker)}
      onNewFolder={fromSidebar(() => setFolderDialogOpen(true))}
      onToggleTheme={toggleTheme}
      onShowShortcuts={fromSidebar(() => setShortcutsOpen(true))}
      onNavigateHome={fromSidebar(() => navigateToFolder(''))}
    />
  );

  return (
    <div className="flex h-full bg-canvas text-ink">
      <aside className="hidden w-64 shrink-0 border-r border-line bg-surface lg:block">{sidebar}</aside>
      <MobileDrawer open={navOpen} onClose={() => setNavOpen(false)}>
        {sidebar}
      </MobileDrawer>

      <div className="flex min-w-0 flex-1 flex-col">
        <Toolbar
          currentPrefix={currentPrefix}
          rootLabel={ROOT_LABEL}
          search={view.search}
          searchRef={searchRef}
          view={view.view}
          sort={view.sort}
          refreshing={listing.loading || health.loading}
          onNavigate={navigateToFolder}
          onNavigateUp={navigateUp}
          onSearchChange={view.setSearch}
          onViewChange={view.setView}
          onSortChange={view.changeSort}
          onRefresh={refresh}
          onOpenNav={() => setNavOpen(true)}
          dragActive={drag.dragIds !== null}
          onDropToPrefix={drag.dropOn}
        />

        <ClipboardBar
          clipboard={clipboard.clipboard}
          destination={folderLabel(currentPrefix, ROOT_LABEL)}
          canPaste={clipboard.canPaste}
          busy={transfers.transferring}
          onPaste={clipboard.paste}
          onClear={clipboard.clear}
        />

        <div className="relative flex min-h-0 flex-1">
          <main className="min-w-0 flex-1 overflow-y-auto" aria-busy={listing.loading}>
            <ListingState
              error={listing.error}
              loading={listing.loading}
              empty={view.entries.length === 0}
              filtered={view.filtered}
              view={view.view}
              onRetry={refetch}
              onClearFilters={() => {
                view.setSearch('');
                view.setFilter('all');
              }}
            >
              <FileBrowser
                key={`${currentPrefix}|${view.view}`}
                entries={view.entries}
                view={view.view}
                selection={selection.selected}
                sort={view.sort}
                onSortChange={view.changeSort}
                onOpenFolder={navigateToFolder}
                onChoose={selection.choose}
                onToggleSelect={selection.toggle}
                onSelectRange={selection.selectRange}
                onSelectAll={selection.selectAll}
                onClearSelection={selection.clear}
                onGoUp={navigateUp}
                onReachEnd={listing.hasMore ? listing.loadMore : undefined}
                dragIds={drag.dragIds}
                busyIds={transfers.movingIds}
                cutIds={clipboard.cutIds}
                onDragStart={drag.startDrag}
                onDragEnd={drag.endDrag}
                onDropOnFolder={drag.dropOn}
                onDownload={downloadFile}
                onDownloadZip={zip.download}
                onDelete={(entry) => deletes.request([entry])}
                onTransfer={(entry, mode) => transfers.openTransfer({ entry, mode })}
              />
            </ListingState>
            {!listing.loading && !listing.error && (
              <LoadMore
                hasMore={listing.hasMore}
                loading={listing.loadingMore}
                error={listing.loadMoreError}
                loadedCount={view.allEntries.length}
                onLoadMore={listing.loadMore}
              />
            )}
          </main>

          <BulkBar
            entries={bulkEntries}
            busy={deletes.deleting}
            onMove={() => transfers.openBulkTransfer({ mode: 'move', entries: bulkEntries })}
            onCopy={() => transfers.openBulkTransfer({ mode: 'copy', entries: bulkEntries })}
            onDownloadZip={() => zip.download(bulkEntries)}
            onDelete={() => deletes.request(bulkEntries)}
            onClear={selection.clear}
          />

          <InspectorPanel
            file={selectedFile}
            bucket={health.health?.bucket}
            onClose={selection.clear}
            onDownload={downloadFile}
            onDelete={(file) => deletes.request([{ type: 'file', id: file.key, name: file.name, file }])}
            onTransfer={(file, mode) =>
              transfers.openTransfer({ entry: { type: 'file', id: file.key, name: file.name, file }, mode })
            }
          />
        </div>

        <StatusBar
          folderCount={data?.folders.length ?? 0}
          fileCount={data?.objects.length ?? 0}
          totalSize={data?.total_size ?? 0}
          hasMore={listing.hasMore}
          shown={view.filtered && !listing.loading ? view.entries.length : undefined}
        />
      </div>

      <UploadPickers
        fileInputRef={uploads.fileInputRef}
        folderInputRef={uploads.folderInputRef}
        onFiles={uploads.uploadFiles}
        onFolder={uploads.uploadContent}
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
      <DeleteDialog
        entries={deletes.pending}
        loading={deletes.deleting}
        onConfirm={deletes.confirm}
        onCancel={deletes.cancel}
      />
      <TransferDialog
        target={transfers.transfer}
        startPrefix={currentPrefix}
        onClose={() => transfers.openTransfer(null)}
        onDone={transfers.onTransferDone}
      />
      <BulkTransferDialog
        target={transfers.bulkTransfer}
        startPrefix={currentPrefix}
        onClose={() => transfers.openBulkTransfer(null)}
        onDone={transfers.onBulkTransferDone}
      />
      <ShortcutsDialog open={shortcutsOpen} onClose={() => setShortcutsOpen(false)} />

      <UploadTray {...uploads.tray} />
      <DropOverlay visible={uploads.dragging} destination={currentPrefix || 'the root folder'} />
      <AppToaster theme={theme} />
    </div>
  );
}

export default FilesPage;
