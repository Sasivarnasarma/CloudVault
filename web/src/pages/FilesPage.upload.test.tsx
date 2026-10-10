import { installPageMocks, renderPage, listMock } from './filesPage.testkit';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { dirEntry, dropItems, fileEntry } from '../test/fsEntries';
import { createFolder } from '../services/folderService';
import { ApiError } from '../services/http';
import { requestPresignedUpload } from '../services/objectService';
import { uploadFileDirect } from '../services/transferService';
import { FilesPage } from './FilesPage';

beforeEach(installPageMocks);

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
    await user.upload(input, [
      withPath('a.txt', 'Trip/a.txt'),
      withPath('b.txt', 'Trip/day 2/b.txt'),
      withPath('.DS_Store', 'Trip/.DS_Store'),
    ]);

    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledTimes(2));
    const keys = vi
      .mocked(requestPresignedUpload)
      .mock.calls.map((c) => c[0])
      .sort();
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
    const tree = dirEntry('Album', [
      fileEntry('one.jpg'),
      dirEntry('Inner', [fileEntry('two.jpg')]),
      dirEntry('Blank', []),
    ]);
    const callsBefore = listMock.mock.calls.length;
    dropOnWindow(dropItems(tree));

    await waitFor(() => expect(requestPresignedUpload).toHaveBeenCalledTimes(2));
    expect(
      vi
        .mocked(requestPresignedUpload)
        .mock.calls.map((c) => c[0])
        .sort(),
    ).toEqual(['Album/Inner/two.jpg', 'Album/one.jpg']);
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
