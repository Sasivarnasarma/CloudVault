import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { EmptyFolderState } from './EmptyFolderState';
import { FileBrowser } from './FileBrowser';
import { Inspector } from './Inspector';

vi.mock('../../services/objectService', () => ({
  getObjectMetadata: vi.fn(),
  requestPresignedDownload: vi.fn(),
}));
import { getObjectMetadata, requestPresignedDownload } from '../../services/objectService';

const metadataMock = vi.mocked(getObjectMetadata);
const downloadMock = vi.mocked(requestPresignedDownload);

const folder = makeFolder('Reports');
const report = makeFile('report.pdf', { size: 2048, content_type: 'application/pdf' });
const entries: Entry[] = [
  { type: 'folder', id: folder.prefix, name: folder.name, folder },
  { type: 'file', id: report.key, name: report.name, file: report },
];

function renderBrowser(overrides: Partial<React.ComponentProps<typeof FileBrowser>> = {}) {
  const handlers = {
    onOpenFolder: vi.fn(),
    onSelectFile: vi.fn(),
    onDownload: vi.fn(),
    onDelete: vi.fn(),
    onTransfer: vi.fn(),
    onSortChange: vi.fn(),
  };
  render(
    <FileBrowser
      entries={entries}
      view="grid"
      selectedId={null}
      sort={{ key: 'name', dir: 'asc' }}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('FileBrowser (grid)', () => {
  it('shows folders and files with their details', () => {
    renderBrowser();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Folder')).toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(screen.getByText('2 KB · PDF')).toBeInTheDocument();
  });

  it('opens a folder on a single click', async () => {
    const { onOpenFolder, onSelectFile } = renderBrowser();
    await userEvent.click(screen.getByText('Reports'));
    expect(onOpenFolder).toHaveBeenCalledWith('Reports/');
    expect(onSelectFile).not.toHaveBeenCalled();
  });

  it('selects a file on click and downloads it on double click', async () => {
    const { onSelectFile, onDownload } = renderBrowser();
    await userEvent.click(screen.getByText('report.pdf'));
    expect(onSelectFile).toHaveBeenCalledWith('report.pdf');

    await userEvent.dblClick(screen.getByText('report.pdf'));
    expect(onDownload).toHaveBeenCalledWith('report.pdf', 'report.pdf');
  });

  it('reflects the selected file for assistive tech', () => {
    renderBrowser({ selectedId: 'report.pdf' });
    const pressed = screen.getByRole('button', { pressed: true });
    expect(pressed).toHaveTextContent('report.pdf');
  });

  it('offers per-item actions from the more menu', async () => {
    const { onDelete, onDownload } = renderBrowser();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for report.pdf' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith('report.pdf', 'report.pdf');

    await userEvent.click(screen.getByRole('button', { name: 'More actions for Reports' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Delete folder' }));
    expect(onDelete).toHaveBeenCalledWith(entries[0]);
  });
});

describe('FileBrowser organize actions', () => {
  it('offers rename, move and copy for files', async () => {
    const { onTransfer } = renderBrowser();
    for (const [label, mode] of [['Rename', 'rename'], ['Move to…', 'move'], ['Copy to…', 'copy']] as const) {
      await userEvent.click(screen.getByRole('button', { name: 'More actions for report.pdf' }));
      await userEvent.click(await screen.findByRole('menuitem', { name: label }));
      expect(onTransfer).toHaveBeenLastCalledWith(entries[1], mode);
    }
  });

  it('offers rename, move and copy for folders too', async () => {
    const { onTransfer } = renderBrowser();
    await userEvent.click(screen.getByRole('button', { name: 'More actions for Reports' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: 'Move to…' }));
    expect(onTransfer).toHaveBeenCalledWith(entries[0], 'move');
  });
});

describe('FileBrowser (list)', () => {
  it('renders sortable columns and marks the active sort', () => {
    renderBrowser({ view: 'list', sort: { key: 'size', dir: 'desc' } });
    expect(screen.getByRole('columnheader', { name: /Size/ })).toHaveAttribute('aria-sort', 'descending');
    expect(screen.getByRole('columnheader', { name: /Name/ })).toHaveAttribute('aria-sort', 'none');
  });

  it('asks to sort when a header is clicked', async () => {
    const { onSortChange } = renderBrowser({ view: 'list' });
    await userEvent.click(within(screen.getByRole('columnheader', { name: /Modified/ })).getByRole('button'));
    expect(onSortChange).toHaveBeenCalledWith('modified');
  });

  it('shows dashes for folder size and modified date', () => {
    renderBrowser({ view: 'list' });
    const folderRow = screen.getByText('Reports').closest('tr')!;
    expect(within(folderRow).getAllByText('—')).toHaveLength(2);
  });

  it('opens folders and selects files like the grid', async () => {
    const { onOpenFolder, onSelectFile } = renderBrowser({ view: 'list' });
    await userEvent.click(screen.getByText('Reports'));
    expect(onOpenFolder).toHaveBeenCalledWith('Reports/');
    await userEvent.click(screen.getByText('report.pdf'));
    expect(onSelectFile).toHaveBeenCalledWith('report.pdf');
  });
});

describe('EmptyFolderState', () => {
  it('invites the user to add content to an empty folder', () => {
    render(<EmptyFolderState filtered={false} onClearFilters={() => {}} />);
    expect(screen.getByText('This folder is empty')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('offers to clear filters when nothing matches', async () => {
    const onClear = vi.fn();
    render(<EmptyFolderState filtered onClearFilters={onClear} />);
    expect(screen.getByText('Nothing matches your filters')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });
});

describe('Inspector', () => {
  beforeEach(() => {
    metadataMock.mockReset();
    downloadMock.mockReset();
    metadataMock.mockImplementation(async (key) => ({ ...makeFile(key), content_type: 'application/pdf' }));
    downloadMock.mockResolvedValue({ download_url: 'https://storage.test/img.png', key: 'k', expires_in: 3600 });
  });

  const renderInspector = (file = report) => {
    const handlers = { onClose: vi.fn(), onDownload: vi.fn(), onDelete: vi.fn(), onTransfer: vi.fn() };
    render(<Inspector file={file} bucket="my-bucket" {...handlers} />);
    return handlers;
  };

  it('describes the file and its storage location', () => {
    renderInspector();
    expect(screen.getByText('report.pdf', { selector: 'p' })).toBeInTheDocument();
    expect(screen.getByText('s3://my-bucket/report.pdf')).toBeInTheDocument();
    expect(screen.getByText('etag-report.pdf')).toBeInTheDocument();
  });

  it('replaces the guessed content type with the real one from storage', async () => {
    renderInspector(makeFile('data.bin', { content_type: 'application/octet-stream' }));
    expect(screen.getByText(/application\/octet-stream/)).toBeInTheDocument();
    expect(await screen.findByText(/application\/pdf/)).toBeInTheDocument();
    expect(metadataMock).toHaveBeenCalledWith('data.bin');
  });

  it('wires up download, delete and close', async () => {
    const { onClose, onDownload, onDelete } = renderInspector();
    await userEvent.click(screen.getByRole('button', { name: 'Download' }));
    expect(onDownload).toHaveBeenCalledWith('report.pdf', 'report.pdf');
    await userEvent.click(screen.getByRole('button', { name: 'Delete file' }));
    expect(onDelete).toHaveBeenCalledWith(report);
    await userEvent.click(screen.getByRole('button', { name: 'Close details' }));
    expect(onClose).toHaveBeenCalled();
  });

  it('starts rename, move and copy from the details panel', async () => {
    const { onTransfer } = renderInspector();
    await userEvent.click(screen.getByRole('button', { name: 'Rename' }));
    expect(onTransfer).toHaveBeenLastCalledWith(report, 'rename');
    await userEvent.click(screen.getByRole('button', { name: 'Move' }));
    expect(onTransfer).toHaveBeenLastCalledWith(report, 'move');
    await userEvent.click(screen.getByRole('button', { name: 'Copy' }));
    expect(onTransfer).toHaveBeenLastCalledWith(report, 'copy');
  });

  it('copies the object key', async () => {
    const user = userEvent.setup();
    renderInspector(makeFile('dir/a.txt'));
    await user.click(screen.getByRole('button', { name: 'Copy object key' }));
    expect(await screen.findByText('Copied')).toBeInTheDocument();
    expect(await navigator.clipboard.readText()).toBe('dir/a.txt');
  });

  it('previews images through a presigned URL but not other files', async () => {
    const image = makeFile('photo.png', { content_type: 'image/png' });
    const { unmount } = render(<Inspector file={image} onClose={() => {}} onDownload={() => {}} onDelete={() => {}} onTransfer={() => {}} />);
    const preview = await screen.findByRole('img', { name: 'photo.png' });
    expect(preview).toHaveAttribute('src', 'https://storage.test/img.png');
    expect(downloadMock).toHaveBeenCalledWith('photo.png');
    unmount();

    downloadMock.mockClear();
    renderInspector();
    await waitFor(() => expect(metadataMock).toHaveBeenCalled());
    expect(downloadMock).not.toHaveBeenCalled();
    expect(screen.queryByRole('img')).not.toBeInTheDocument();
  });
});
