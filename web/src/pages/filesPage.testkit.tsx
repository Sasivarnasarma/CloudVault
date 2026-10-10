import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { vi } from 'vitest';
import { makeFile, makeFolder, makeListing } from '../test/fixtures';
import { FilesPage } from './FilesPage';

// Shared by the FilesPage test files: the mocked services, the sample bucket and the helpers.
// Import this before anything else so the mocks are in place when the page is loaded.
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

export const REPORTS = makeFolder('Reports');
export const PHOTOS = makeFolder('Photos');
export const REPORT = makeFile('report.pdf', { content_type: 'application/pdf', size: 2048 });
export const PHOTO = makeFile('photo.png', { content_type: 'image/png', size: 4096 });
export const NOTES = makeFile('notes.md', { content_type: 'text/markdown', size: 512 });
export const NESTED = makeFile('Reports/q1.pdf', { name: 'q1.pdf', content_type: 'application/pdf' });

export const ROOT = makeListing('', [REPORTS, PHOTOS], [REPORT, PHOTO, NOTES]);
export const INSIDE = makeListing('Reports/', [], [NESTED]);

export const listMock = vi.mocked(listObjects);

/** Reset the service mocks to a bucket with a few files and folders. Use as `beforeEach(installPageMocks)`. */
export function installPageMocks() {
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
  vi.mocked(getObjectMetadata)
    .mockReset()
    .mockImplementation(async (key) => makeFile(key));
  vi.mocked(requestPresignedDownload)
    .mockReset()
    .mockResolvedValue({ download_url: 'https://storage.test/get', key: 'k', expires_in: 3600 });
  vi.mocked(requestPresignedUpload)
    .mockReset()
    .mockImplementation(async (key) => ({
      upload_url: 'https://storage.test/put',
      headers: {},
      key,
      method: 'PUT',
      expires_in: 900,
    }));
  vi.mocked(uploadFileDirect).mockReset().mockResolvedValue(undefined);
  vi.mocked(triggerBrowserDownload).mockReset();
}

/** Show the page and wait for the root listing. Returns a `userEvent` for the test to use. */
export async function renderPage() {
  const user = userEvent.setup();
  render(<FilesPage />);
  await screen.findByText('report.pdf');
  return user;
}
