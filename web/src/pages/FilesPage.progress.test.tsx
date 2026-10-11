import { installPageMocks, renderPage } from './filesPage.testkit';
import { act, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { copyFolder, moveFolder } from '../services/folderService';

beforeEach(installPageMocks);

const item = (name: string) =>
  document.querySelector(`[data-entry-main] [title="${name}"]`)!.closest('[data-entry-main]') as HTMLElement;

/** Select the Reports folder, copy it and paste it into Photos. */
async function pasteReportsIntoPhotos(user: Awaited<ReturnType<typeof renderPage>>, key: 'c' | 'x') {
  act(() => item('Reports').focus());
  await user.keyboard(' ');
  await user.keyboard(`{Control>}${key}{/Control}`);
  await user.dblClick(screen.getByText('Photos'));
  await waitFor(() => expect(window.location.search).toBe('?p=Photos'));
  await user.keyboard('{Control>}v{/Control}');
}

describe('FilesPage: following a long copy or move', () => {
  it('shows how many files are done while a folder is copied, then the result', async () => {
    let finish!: () => void;
    vi.mocked(copyFolder).mockImplementation(async (source, destination, options) => {
      options?.onProgress?.({ done: 0, total: 1200 });
      options?.onProgress?.({ done: 340, total: 1200 });
      await new Promise<void>((resolve) => (finish = resolve));
      return { success: true, source, destination, item_count: 1200 };
    });
    const user = await renderPage();
    await pasteReportsIntoPhotos(user, 'c');

    expect(await screen.findByText('340 of 1,200 files')).toBeInTheDocument();
    expect(screen.getByText(/Copying 1 folder/)).toBeInTheDocument();

    await act(async () => finish());
    expect(await screen.findByText('Copied 1 folder')).toBeInTheDocument();
    expect(screen.queryByText('340 of 1,200 files')).not.toBeInTheDocument();
  });

  it('stops the transfer from the toast and says nothing was changed', async () => {
    let signal: AbortSignal | undefined;
    vi.mocked(moveFolder).mockImplementation(
      (_source, _destination, options) =>
        new Promise((_resolve, reject) => {
          signal = options?.signal;
          options?.onProgress?.({ done: 5, total: 100 });
          signal?.addEventListener('abort', () => reject(new DOMException('Aborted', 'AbortError')));
        }),
    );
    const user = await renderPage();
    await pasteReportsIntoPhotos(user, 'x');

    await user.click(await screen.findByRole('button', { name: 'Cancel' }));

    expect(signal?.aborted).toBe(true);
    expect(await screen.findByText('Stopped. Nothing was changed.')).toBeInTheDocument();
    expect(screen.queryByText(/Couldn’t move/)).not.toBeInTheDocument();
  });
});
