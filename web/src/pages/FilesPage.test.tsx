import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFile, makeFolder, makeListing } from '../test/fixtures';
import { dirEntry, dropItems, fileEntry } from '../test/fsEntries';
import type { ObjectListResponse } from '../types';
import { FilesPage } from './FilesPage';

vi.mock('../services/healthService', () => ({ fetchHealthStatus: vi.fn() }));
vi.mock('../services/objectService', () => ({
  listObjects: vi.fn(),
  copyObject: vi.fn(),
  moveObject: vi.fn(),
  deleteObject: vi.fn(),
  getObjectMetadata: vi.fn(),
  requestPresignedDownload: vi.fn(),
  requestPresignedUpload: vi.fn(),
}));
vi.mock('../services/folderService', () => ({
  createFolder: vi.fn(),
  deleteFolder: vi.fn(),
  copyFolder: vi.fn(),
  moveFolder: vi.fn(),
}));
vi.mock('../services/transferService', async (importActual) => ({
  ...(await importActual<typeof import('../services/transferService')>()),
  uploadFileDirect: vi.fn(),
  uploadPartDirect: vi.fn(),
  triggerBrowserDownload: vi.fn(),
}));

import { copyFolder, createFolder, deleteFolder, moveFolder } from '../services/folderService';
import { ApiError } from '../services/http';
import { fetchHealthStatus } from '../services/healthService';
import {
  copyObject,
  deleteObject,
  getObjectMetadata,
  listObjects,
  moveObject,
  requestPresignedDownload,
  requestPresignedUpload,
} from '../services/objectService';
import { triggerBrowserDownload, uploadFileDirect } from '../services/transferService';

const REPORTS = makeFolder('Reports');
const PHOTOS = makeFolder('Photos');
const REPORT = makeFile('report.pdf', { content_type: 'application/pdf', size: 2048 });
const PHOTO = makeFile('photo.png', { content_type: 'image/png', size: 4096 });
const NOTES = makeFile('notes.md', { content_type: 'text/markdown', size: 512 });
const NESTED = makeFile('Reports/q1.pdf', { name: 'q1.pdf', content_type: 'application/pdf' });

const ROOT = makeListing('', [REPORTS, PHOTOS], [REPORT, PHOTO, NOTES]);
const INSIDE = makeListing('Reports/', [], [NESTED]);

const listMock = vi.mocked(listObjects);

beforeEach(() => {
  window.localStorage.clear();
  vi.mocked(fetchHealthStatus).mockResolvedValue({
    status: 'ok',
    app_name: 'CloudVault API',
    version: '0.1.0',
    storage_provider: 'minio',
    bucket: 'test-bucket',
    storage_connected: true,
  });
  listMock.mockReset();
  listMock.mockImplementation(async (prefix = '') => (prefix === 'Reports/' ? INSIDE : ROOT));
  vi.mocked(deleteObject).mockReset().mockResolvedValue({ success: true, key: '', message: '' });
  vi.mocked(deleteFolder).mockReset().mockResolvedValue({ success: true, prefix: '', deleted_count: 4 });
  vi.mocked(moveObject).mockReset().mockResolvedValue({ success: true, source: '', destination: '' });
  vi.mocked(copyObject).mockReset().mockResolvedValue({ success: true, source: '', destination: '' });
  vi.mocked(moveFolder).mockReset().mockResolvedValue({ success: true, source: '', destination: '', item_count: 2 });
  vi.mocked(copyFolder).mockReset().mockResolvedValue({ success: true, source: '', destination: '', item_count: 2 });
  vi.mocked(createFolder).mockReset().mockResolvedValue({ success: true, folder: REPORTS });
  vi.mocked(getObjectMetadata).mockReset().mockImplementation(async (key) => makeFile(key));
  vi.mocked(requestPresignedDownload)
    .mockReset()
    .mockResolvedValue({ download_url: 'https://storage.test/get', key: 'k', expires_in: 3600 });
  vi.mocked(requestPresignedUpload)
    .mockReset()
    .mockImplementation(async (key) => ({ upload_url: 'https://storage.test/put', headers: {}, key, method: 'PUT', expires_in: 900 }));
  vi.mocked(uploadFileDirect).mockReset().mockResolvedValue(undefined);
  vi.mocked(triggerBrowserDownload).mockReset();
});

async function renderPage() {
  const user = userEvent.setup();
  render(<FilesPage />);
  await screen.findByText('report.pdf');
  return user;
}

describe('FilesPage', () => {
  it('lists folders and files from the bucket with a summary footer', async () => {
    await renderPage();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('notes.md')).toBeInTheDocument();
    expect(screen.getByText('2 folders, 3 files')).toBeInTheDocument();
    expect(await screen.findByText('test-bucket')).toBeInTheDocument();
  });

  it('shows a loading state before the listing arrives', async () => {
    let resolve!: (value: ObjectListResponse) => void;
    listMock.mockReturnValue(new Promise((res) => (resolve = res)));
    render(<FilesPage />);
    expect(screen.getAllByRole('status', { name: 'Loading files' })).not.toHaveLength(0);
    resolve(ROOT);
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
  });

  it('opens a folder, updates the URL and shows its contents', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('Reports'));

    expect(await screen.findByText('q1.pdf')).toBeInTheDocument();
    expect(window.location.search).toBe('?p=Reports');
    expect(listMock).toHaveBeenLastCalledWith('Reports/', { limit: 500 });
    expect(screen.getByRole('navigation', { name: 'Folder path' })).toHaveTextContent('Reports');
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
  });

  it('restores the folder from the URL after a refresh', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    render(<FilesPage />);
    expect(await screen.findByText('q1.pdf')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith('Reports/', { limit: 500 });
  });

  it('goes back to the root with the breadcrumb', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('Reports'));
    await screen.findByText('q1.pdf');

    await user.click(within(screen.getByRole('navigation', { name: 'Folder path' })).getByRole('button', { name: 'All files' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
    expect(window.location.search).toBe('');
  });

  it('filters by search text and offers to clear when nothing matches', async () => {
    const user = await renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'PHOTO');
    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.getByText('Photos')).toBeInTheDocument();
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();

    await user.type(screen.getByRole('searchbox'), 'zzz');
    expect(screen.getByText('Nothing matches your filters')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Clear filters' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
  });

  it('keeps folders visible when a category filter is active', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: /Images/ }));

    expect(screen.getByText('photo.png')).toBeInTheDocument();
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
    expect(screen.queryByText('notes.md')).not.toBeInTheDocument();
    expect(screen.getByText('Reports')).toBeInTheDocument();
    expect(screen.getByText('Photos')).toBeInTheDocument();
  });

  it('switches to list view and remembers the choice', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'List view' }));
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(window.localStorage.getItem('cloudvault_view')).toBe('list');
  });

  it('shows an error with a retry button when the listing fails', async () => {
    listMock.mockRejectedValueOnce(new Error('Storage service is unavailable'));
    const user = userEvent.setup();
    render(<FilesPage />);

    expect(await screen.findByText('Unable to load files')).toBeInTheDocument();
    expect(screen.getByText('Storage service is unavailable')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Try again' }));
    expect(await screen.findByText('report.pdf')).toBeInTheDocument();
  });

  it('shows details for a selected file and closes them with Escape', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));

    const details = await screen.findByRole('complementary', { name: 'File details' });
    expect(within(details).getByText('s3://test-bucket/report.pdf')).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'File details' })).not.toBeInTheDocument());
  });

  it('downloads through a presigned URL', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    await user.click(await screen.findByRole('button', { name: 'Download' }));

    await waitFor(() => expect(triggerBrowserDownload).toHaveBeenCalledWith('https://storage.test/get'));
    expect(requestPresignedDownload).toHaveBeenCalledWith('report.pdf', 'report.pdf');
  });

  it('deletes a file only after confirmation, then refreshes the listing', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    await user.click(await screen.findByRole('button', { name: 'Delete file' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete file?' });
    expect(deleteObject).not.toHaveBeenCalled();

    const callsBefore = listMock.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteObject).toHaveBeenCalledWith('report.pdf'));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('does nothing when the delete confirmation is cancelled', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    await user.click(await screen.findByRole('button', { name: 'Delete file' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Cancel' }));

    expect(deleteObject).not.toHaveBeenCalled();
  });

  it('deletes a folder recursively after confirmation', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'More actions for Reports' }));
    await user.click(await screen.findByRole('menuitem', { name: 'Delete folder' }));

    const dialog = await screen.findByRole('dialog', { name: 'Delete folder?' });
    expect(dialog).toHaveTextContent('everything inside it');
    await user.click(within(dialog).getByRole('button', { name: 'Delete' }));
    await waitFor(() => expect(deleteFolder).toHaveBeenCalledWith('Reports/'));
  });

  it('keeps the dialog open and the file in place when deletion fails', async () => {
    vi.mocked(deleteObject).mockRejectedValueOnce(new Error('Storage failed while deleting object'));
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    await user.click(await screen.findByRole('button', { name: 'Delete file' }));
    await user.click(within(await screen.findByRole('dialog')).getByRole('button', { name: 'Delete' }));

    await waitFor(() => expect(deleteObject).toHaveBeenCalled());
    expect(screen.getByRole('dialog', { name: 'Delete file?' })).toBeInTheDocument();
    expect(screen.getByText('report.pdf', { selector: 'span' })).toBeInTheDocument();
  });

  it('creates a folder in the current location and refreshes', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Folder' }));
    await user.type(await screen.findByLabelText('Folder name'), 'Archive');

    const callsBefore = listMock.mock.calls.length;
    await user.click(screen.getByRole('button', { name: 'Create folder' }));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith('Archive'));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('uploads picked files straight to storage and shows progress', async () => {
    const user = await renderPage();
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    const file = new File(['hello'], 'hello.txt', { type: 'text/plain' });

    const callsBefore = listMock.mock.calls.length;
    await user.upload(input, file);

    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledWith('hello.txt', 'text/plain', 5, false));
    expect(uploadFileDirect).toHaveBeenCalledWith('https://storage.test/put', file, 'text/plain', expect.any(Function), expect.any(AbortSignal));
    expect(await screen.findByText('1 upload complete')).toBeInTheDocument();
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('uploads into the folder being viewed', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File(['x'], 'new.txt', { type: 'text/plain' }));
    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledWith('Reports/new.txt', 'text/plain', 1, false));
  });
});


describe('FilesPage organize actions', () => {
  const openMenu = async (user: ReturnType<typeof userEvent.setup>, name: string, item: string) => {
    await user.click(screen.getByRole('button', { name: `More actions for ${name}` }));
    await user.click(await screen.findByRole('menuitem', { name: item }));
  };

  it('renames a file from its menu and refreshes the listing', async () => {
    const user = await renderPage();
    await openMenu(user, 'report.pdf', 'Rename');

    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    const input = within(dialog).getByLabelText('Name');
    expect(input).toHaveValue('report.pdf');
    await user.clear(input);
    await user.type(input, 'final.pdf');

    const callsBefore = listMock.mock.calls.length;
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));
    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('report.pdf', 'final.pdf', false));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('moves a file into another folder from the details panel', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    const details = await screen.findByRole('complementary', { name: 'File details' });
    await user.click(within(details).getByRole('button', { name: 'Move' }));

    const dialog = await screen.findByRole('dialog', { name: 'Move to…' });
    await user.click(await within(dialog).findByRole('button', { name: 'Reports' }));
    await waitFor(() => expect(listMock).toHaveBeenLastCalledWith('Reports/')); // the picker lists without paging
    await user.click(within(dialog).getByRole('button', { name: 'Move here' }));

    await waitFor(() => expect(moveObject).toHaveBeenCalledWith('report.pdf', 'Reports/report.pdf', false));
    // the moved file is no longer selected, so its details panel closes
    await waitFor(() => expect(screen.queryByRole('complementary', { name: 'File details' })).not.toBeInTheDocument());
  });

  it('copies a folder under a new name', async () => {
    const user = await renderPage();
    await openMenu(user, 'Reports', 'Copy to…');

    const dialog = await screen.findByRole('dialog', { name: 'Copy to…' });
    const input = within(dialog).getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'Reports backup');
    await user.click(within(dialog).getByRole('button', { name: 'Copy here' }));

    await waitFor(() => expect(copyFolder).toHaveBeenCalledWith('Reports/', 'Reports backup'));
  });

  it('copying keeps the original selected', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('report.pdf'));
    const details = await screen.findByRole('complementary', { name: 'File details' });
    await user.click(within(details).getByRole('button', { name: 'Copy' }));

    const dialog = await screen.findByRole('dialog', { name: 'Copy to…' });
    const input = within(dialog).getByLabelText('Name');
    await user.clear(input);
    await user.type(input, 'report copy.pdf');
    await user.click(within(dialog).getByRole('button', { name: 'Copy here' }));

    await waitFor(() => expect(copyObject).toHaveBeenCalledWith('report.pdf', 'report copy.pdf', false));
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
    expect(screen.getByRole('complementary', { name: 'File details' })).toBeInTheDocument();
  });

  it('offers to replace when the new name is already taken', async () => {
    vi.mocked(moveObject).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const user = await renderPage();
    await openMenu(user, 'report.pdf', 'Rename');

    const dialog = await screen.findByRole('dialog', { name: 'Rename' });
    await user.clear(within(dialog).getByLabelText('Name'));
    await user.type(within(dialog).getByLabelText('Name'), 'notes.md');
    await user.click(within(dialog).getByRole('button', { name: 'Rename' }));

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('already exists');
    await user.click(within(dialog).getByRole('button', { name: 'Replace existing file' }));
    await waitFor(() => expect(moveObject).toHaveBeenLastCalledWith('report.pdf', 'notes.md', true));
  });
});

describe('FilesPage upload conflicts', () => {
  const pickFile = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['data'], name, { type: 'text/plain' }));
  };

  it('lets the user replace a file that already exists', async () => {
    vi.mocked(requestPresignedUpload).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const user = await renderPage();
    await pickFile(user, 'report.pdf');

    expect(await screen.findByText('1 file already exists')).toBeInTheDocument();
    expect(uploadFileDirect).not.toHaveBeenCalled();

    await user.click(screen.getByRole('button', { name: 'Replace report.pdf' }));
    await waitFor(() => expect(requestPresignedUpload).toHaveBeenLastCalledWith('report.pdf', 'text/plain', 4, true));
    await waitFor(() => expect(uploadFileDirect).toHaveBeenCalledTimes(1));
    expect(await screen.findByText('1 upload complete')).toBeInTheDocument();
  });

  it('lets the user skip a conflicting file', async () => {
    vi.mocked(requestPresignedUpload).mockRejectedValueOnce(new ApiError('A file with this name already exists', 409));
    const user = await renderPage();
    await pickFile(user, 'report.pdf');

    await user.click(await screen.findByRole('button', { name: 'Skip report.pdf' }));
    await waitFor(() => expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument());
    expect(uploadFileDirect).not.toHaveBeenCalled();
  });
});

describe('FilesPage large folders', () => {
  it('loads further pages on demand and keeps the earlier ones', async () => {
    const more = makeFile('zeta.txt', { content_type: 'text/plain' });
    listMock.mockImplementation(async (_prefix = '', opts) =>
      opts?.cursor
        ? { ...makeListing('', [], [more]), next_cursor: null, has_more: false }
        : { ...ROOT, next_cursor: 'c1', has_more: true },
    );
    const user = await renderPage();

    expect(screen.getByText('Showing the first 5 items')).toBeInTheDocument();
    expect(screen.getByText('2+ folders, 3+ files')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Load more' }));
    expect(await screen.findByText('zeta.txt')).toBeInTheDocument();
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(listMock).toHaveBeenLastCalledWith('', { limit: 500, cursor: 'c1' });
    expect(screen.queryByRole('button', { name: 'Load more' })).not.toBeInTheDocument();
    expect(screen.getByText('2 folders, 4 files')).toBeInTheDocument();
  });
});

describe('FilesPage upload control', () => {
  const pickFile = async (user: ReturnType<typeof userEvent.setup>, name: string) => {
    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await user.upload(input, new File(['data'], name, { type: 'text/plain' }));
  };

  it('retries a failed upload', async () => {
    vi.mocked(uploadFileDirect).mockRejectedValueOnce(new Error('Network error occurred during direct storage upload'));
    const user = await renderPage();
    await pickFile(user, 'flaky.txt');

    expect(await screen.findByText('0 uploaded, 1 failed')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Retry flaky.txt' }));
    expect(await screen.findByText('1 upload complete')).toBeInTheDocument();
    expect(uploadFileDirect).toHaveBeenCalledTimes(2);
  });

  it('cancels an upload that is in progress', async () => {
    vi.mocked(uploadFileDirect).mockImplementationOnce(
      (_url, _file, _type, _progress, signal) =>
        new Promise<void>((_resolve, reject) => {
          signal?.addEventListener('abort', () => reject(new DOMException('Upload cancelled', 'AbortError')));
        }),
    );
    const user = await renderPage();
    await pickFile(user, 'slow.txt');

    await user.click(await screen.findByRole('button', { name: 'Cancel slow.txt' }));
    expect(await screen.findByText('Upload cancelled')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry slow.txt' })).toBeInTheDocument();
  });

  it('accepts more files while earlier uploads are still running', async () => {
    let release!: () => void;
    vi.mocked(uploadFileDirect).mockImplementationOnce(() => new Promise<void>((resolve) => (release = resolve)));
    const user = await renderPage();
    await pickFile(user, 'first.txt');
    await screen.findByRole('button', { name: 'Cancel first.txt' });

    await pickFile(user, 'second.txt');
    expect(await screen.findByLabelText('Uploaded')).toBeInTheDocument(); // second finished while first still runs
    expect(screen.getByText('first.txt')).toBeInTheDocument();
    expect(screen.getByText('second.txt')).toBeInTheDocument();

    release();
    await waitFor(() => expect(screen.getByText('2 uploads complete')).toBeInTheDocument());
  });
});

describe('FilesPage folder upload', () => {
  const dropOnWindow = (items: DataTransferItemList) => {
    const event = new Event('drop', { cancelable: true }) as DragEvent;
    Object.defineProperty(event, 'dataTransfer', { value: { types: ['Files'], items } });
    window.dispatchEvent(event);
  };

  const withPath = (name: string, path: string) => {
    const f = new File(['data'], name, { type: 'text/plain' });
    Object.defineProperty(f, 'webkitRelativePath', { value: path });
    return f;
  };

  it('uploads a picked folder with its structure, into the folder being viewed', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    const user = userEvent.setup();
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    const input = document.querySelector<HTMLInputElement>('input[aria-label="Upload folder"]')!;
    await user.upload(input, [withPath('a.txt', 'Trip/a.txt'), withPath('b.txt', 'Trip/day 2/b.txt'), withPath('.DS_Store', 'Trip/.DS_Store')]);

    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledTimes(2));
    const keys = vi.mocked(requestPresignedUpload).mock.calls.map((c) => c[0]).sort();
    expect(keys).toEqual(['Reports/Trip/a.txt', 'Reports/Trip/day 2/b.txt']);
    expect(await screen.findByText('2 uploads complete')).toBeInTheDocument();
  });

  it('opens the folder picker from the sidebar', async () => {
    const user = await renderPage();
    const input = document.querySelector<HTMLInputElement>('input[aria-label="Upload folder"]')!;
    const click = vi.spyOn(input, 'click');
    await user.click(screen.getByRole('button', { name: 'Upload folder' }));
    expect(click).toHaveBeenCalledTimes(1);
  });

  it('uploads a folder dropped on the window and keeps empty folders', async () => {
    await renderPage();
    const tree = dirEntry('Album', [fileEntry('one.jpg'), dirEntry('Inner', [fileEntry('two.jpg')]), dirEntry('Blank', [])]);
    const callsBefore = listMock.mock.calls.length;
    dropOnWindow(dropItems(tree));

    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledTimes(2));
    expect(vi.mocked(requestPresignedUpload).mock.calls.map((c) => c[0]).sort()).toEqual(['Album/Inner/two.jpg', 'Album/one.jpg']);
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith('Album/Blank'));
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('creates folders for a drop that contains only empty folders', async () => {
    await renderPage();
    dropOnWindow(dropItems(dirEntry('JustAShell', [])));
    await waitFor(() => expect(createFolder).toHaveBeenCalledWith('JustAShell'));
    expect(requestPresignedUpload).not.toHaveBeenCalled();
  });

  it('still uploads plain files dropped on the window', async () => {
    await renderPage();
    dropOnWindow(dropItems(new File(['hi'], 'loose.txt', { type: 'text/plain' })));
    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledWith('loose.txt', 'text/plain', 2, false));
  });

  it('replaces all conflicting files from a dropped folder in one go', async () => {
    vi.mocked(requestPresignedUpload).mockImplementation(async (key, _t, _s, overwrite) => {
      if (!overwrite) throw new ApiError('A file with this name already exists', 409);
      return { upload_url: 'https://storage.test/put', headers: {}, key, method: 'PUT', expires_in: 900 };
    });
    const user = await renderPage();
    dropOnWindow(dropItems(dirEntry('Dup', [fileEntry('a.txt'), fileEntry('b.txt')])));

    expect(await screen.findByRole('button', { name: 'Replace all' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Replace all' }));
    expect(await screen.findByText('2 uploads complete')).toBeInTheDocument();
    expect(uploadFileDirect).toHaveBeenCalledTimes(2);
  });
});

