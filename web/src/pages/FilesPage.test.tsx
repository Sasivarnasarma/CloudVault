import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFile, makeFolder, makeListing } from '../test/fixtures';
import type { ObjectListResponse } from '../types';
import { FilesPage } from './FilesPage';

vi.mock('../services/healthService', () => ({ fetchHealthStatus: vi.fn() }));
vi.mock('../services/objectService', () => ({
  listObjects: vi.fn(),
  deleteObject: vi.fn(),
  getObjectMetadata: vi.fn(),
  requestPresignedDownload: vi.fn(),
  requestPresignedUpload: vi.fn(),
}));
vi.mock('../services/folderService', () => ({ createFolder: vi.fn(), deleteFolder: vi.fn() }));
vi.mock('../services/transferService', () => ({ uploadFileDirect: vi.fn(), triggerBrowserDownload: vi.fn() }));

import { createFolder, deleteFolder } from '../services/folderService';
import { fetchHealthStatus } from '../services/healthService';
import {
  deleteObject,
  getObjectMetadata,
  listObjects,
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
    expect(listMock).toHaveBeenLastCalledWith('Reports/');
    expect(screen.getByRole('navigation', { name: 'Folder path' })).toHaveTextContent('Reports');
    expect(screen.queryByText('report.pdf')).not.toBeInTheDocument();
  });

  it('restores the folder from the URL after a refresh', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    render(<FilesPage />);
    expect(await screen.findByText('q1.pdf')).toBeInTheDocument();
    expect(listMock).toHaveBeenCalledWith('Reports/');
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

    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledWith('hello.txt', 'text/plain', 5));
    expect(uploadFileDirect).toHaveBeenCalledWith('https://storage.test/put', file, 'text/plain', expect.any(Function));
    expect(await screen.findByText('1 upload complete')).toBeInTheDocument();
    await waitFor(() => expect(listMock.mock.calls.length).toBeGreaterThan(callsBefore));
  });

  it('uploads into the folder being viewed', async () => {
    window.history.replaceState(null, '', '/?p=Reports');
    render(<FilesPage />);
    await screen.findByText('q1.pdf');

    const input = document.querySelector<HTMLInputElement>('input[type="file"]')!;
    await userEvent.upload(input, new File(['x'], 'new.txt', { type: 'text/plain' }));
    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledWith('Reports/new.txt', 'text/plain', 1));
  });
});
