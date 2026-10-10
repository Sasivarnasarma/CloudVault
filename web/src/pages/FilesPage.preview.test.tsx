import { installPageMocks, renderPage } from './filesPage.testkit';
import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { requestPresignedDownload } from '../services/objectService';
import { triggerBrowserDownload, uploadPartDirect } from '../services/transferService';
import { FilesPage } from './FilesPage';

vi.mock('../services/multipartService', () => ({
  createMultipartUpload: vi.fn(),
  presignUploadParts: vi.fn(),
  listUploadedParts: vi.fn(),
  completeMultipartUpload: vi.fn(),
  abortMultipartUpload: vi.fn(),
}));
import { completeMultipartUpload, listUploadedParts, presignUploadParts } from '../services/multipartService';

beforeEach(installPageMocks);

describe('FilesPage: previews', () => {
  it('opens a file in the preview on double click and steps to the next one', async () => {
    const user = await renderPage();
    await user.dblClick(screen.getByText('photo.png'));

    const dialog = await screen.findByRole('dialog', { name: 'photo.png' });
    expect(within(dialog).getByText(/2 of 3/)).toBeInTheDocument();
    expect(await within(dialog).findByRole('img', { name: 'photo.png' })).toBeInTheDocument();
    expect(requestPresignedDownload).toHaveBeenCalledWith('photo.png');
    expect(triggerBrowserDownload).not.toHaveBeenCalled();

    await user.click(within(dialog).getByRole('button', { name: 'Next file' }));
    expect(await screen.findByRole('dialog', { name: 'report.pdf' })).toBeInTheDocument();

    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());
  });

  it('opens the preview with Enter, and from the details panel', async () => {
    const user = await renderPage();
    await user.click(screen.getByText('notes.md'));
    await user.keyboard('{Enter}');
    expect(await screen.findByRole('dialog', { name: 'notes.md' })).toBeInTheDocument();
    await user.keyboard('{Escape}');
    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument());

    await user.click(await screen.findByRole('button', { name: 'Preview' }));
    expect(await screen.findByRole('dialog', { name: 'notes.md' })).toBeInTheDocument();
  });
});

describe('FilesPage: resuming an upload after a refresh', () => {
  const PART = 32 * 1024 * 1024;

  /** A file that reports a large size without allocating it. */
  function bigFile(name: string, lastModified: number) {
    const file = new File(['x'], name, { lastModified });
    Object.defineProperty(file, 'size', { value: 3 * PART });
    file.slice = (start = 0, end = 3 * PART) => {
      const part = new Blob(['x']);
      Object.defineProperty(part, 'size', { value: end - start });
      return part;
    };
    return file;
  }

  beforeEach(() => {
    localStorage.setItem(
      'cloudvault:pending-uploads',
      JSON.stringify([
        {
          key: 'big.bin',
          uploadId: 'u1',
          partSize: PART,
          partCount: 3,
          contentType: 'application/octet-stream',
          fileName: 'big.bin',
          size: 3 * PART,
          lastModified: 1234,
          startedAt: Date.now(),
        },
      ]),
    );
    vi.mocked(listUploadedParts).mockResolvedValue({ parts: [{ part_number: 1, size: PART, etag: 'e1' }] });
    vi.mocked(presignUploadParts).mockImplementation(async (_key, _id, numbers) => ({
      parts: numbers.map((n) => ({ part_number: n, url: `https://storage.test/part/${n}` })),
      expires_in: 3600,
    }));
    vi.mocked(uploadPartDirect).mockReset().mockResolvedValue(undefined);
    vi.mocked(completeMultipartUpload).mockResolvedValue({ success: true, key: 'big.bin', etag: 'e' });
  });

  it('offers the unfinished upload and continues it when the same file is chosen again', async () => {
    const user = userEvent.setup();
    render(<FilesPage />);
    await screen.findByText('report.pdf');
    expect(screen.getByRole('heading', { name: '1 unfinished upload' })).toBeInTheDocument();

    const input = screen.getByLabelText('Choose files to resume') as HTMLInputElement;
    await user.upload(input, bigFile('big.bin', 1234));

    await waitFor(() => expect(completeMultipartUpload).toHaveBeenCalledWith('big.bin', 'u1', 3));
    expect(presignUploadParts).not.toHaveBeenCalledWith('big.bin', 'u1', [1]);
    expect(await screen.findByRole('heading', { name: '1 upload complete' })).toBeInTheDocument();
    expect(localStorage.getItem('cloudvault:pending-uploads')).toBeNull();
  });

  it('says when the chosen file is not the unfinished one', async () => {
    const user = userEvent.setup();
    render(<FilesPage />);
    await screen.findByText('report.pdf');

    await user.upload(screen.getByLabelText('Choose files to resume') as HTMLInputElement, bigFile('big.bin', 999));

    expect(await screen.findByText('“big.bin” isn’t one of the unfinished uploads')).toBeInTheDocument();
    expect(completeMultipartUpload).not.toHaveBeenCalled();
    expect(screen.getByRole('heading', { name: '1 unfinished upload' })).toBeInTheDocument();
  });
});
