import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { makeFile } from '../../test/fixtures';
import { PreviewDialog, TEXT_PREVIEW_BYTES } from './PreviewDialog';

vi.mock('../../services/objectService', () => ({ requestPresignedDownload: vi.fn() }));
import { requestPresignedDownload } from '../../services/objectService';

const photo = makeFile('photo.png', { content_type: 'image/png', size: 2048 });
const notes = makeFile('notes.txt', { content_type: 'text/plain' });
const clip = makeFile('clip.mp4', { content_type: 'video/mp4' });
const paper = makeFile('paper.pdf', { content_type: 'application/pdf' });
const files = [photo, notes, clip, paper];

function setup(currentKey: string | null = photo.key) {
  const h = { onChange: vi.fn(), onClose: vi.fn(), onDownload: vi.fn() };
  const ui = (key: string | null) => <PreviewDialog files={files} currentKey={key} {...h} />;
  const utils = render(ui(currentKey));
  return { h, ...utils, show: (key: string | null) => utils.rerender(ui(key)) };
}

function stubText(text: string) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(text)),
  );
}

// The Markdown renderer and the highlighter are loaded on demand; loading them here keeps the tests
// from racing the first, slow import when many test files run at once.
beforeAll(async () => {
  await Promise.all([import('./MarkdownView'), import('./highlight').then((m) => m.highlight('x', 'python'))]);
}, 60_000);

beforeEach(() => {
  vi.mocked(requestPresignedDownload)
    .mockReset()
    .mockImplementation(async (key) => ({ download_url: `https://storage.test/${key}`, key, expires_in: 3600 }));
});
afterEach(() => vi.unstubAllGlobals());

describe('PreviewDialog', () => {
  it('shows nothing while no file is chosen', () => {
    setup(null);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('shows an image from a temporary storage link, with its name, size and place in the folder', async () => {
    setup();
    expect(await screen.findByRole('img', { name: 'photo.png' })).toHaveAttribute(
      'src',
      'https://storage.test/photo.png',
    );
    expect(screen.getByRole('dialog', { name: 'photo.png' })).toBeInTheDocument();
    expect(screen.getByText(/2 KB · 1 of 4/)).toBeInTheDocument();
    expect(requestPresignedDownload).toHaveBeenCalledWith('photo.png');
  });

  it('shows text files', async () => {
    stubText('line one\nline two');
    setup(notes.key);
    expect(await screen.findByLabelText('File contents')).toHaveTextContent(/line one\s+line two/);
    expect(screen.queryByText(/Showing the first/)).not.toBeInTheDocument();
  });

  it('cuts a long text file and says so', async () => {
    stubText('x'.repeat(TEXT_PREVIEW_BYTES + 10));
    setup(notes.key);
    expect(await screen.findByText(/Showing the first 256 KB/)).toBeInTheDocument();
  });

  it('refuses to print a binary file as text', async () => {
    stubText('PK\u0000\u0003binary');
    setup(notes.key);
    expect(await screen.findByText('This file isn’t text, so it can’t be previewed.')).toBeInTheDocument();
  });

  it('shows videos with controls and PDFs in a frame', async () => {
    const { show } = setup(clip.key);
    await waitFor(() =>
      expect(document.querySelector('video')).toHaveAttribute('src', 'https://storage.test/clip.mp4'),
    );
    expect(document.querySelector('video')).toHaveAttribute('controls');

    show(paper.key);
    expect(await screen.findByTitle('paper.pdf')).toHaveAttribute('src', 'https://storage.test/paper.pdf');
  });

  it('says so when the link cannot be made', async () => {
    vi.mocked(requestPresignedDownload).mockRejectedValue(new Error('nope'));
    setup();
    expect(await screen.findByText('Couldn’t load a preview.')).toBeInTheDocument();
  });

  it('steps through the files with the buttons and the arrow keys', async () => {
    const user = userEvent.setup();
    stubText('x');
    const { h } = setup(notes.key);

    await user.click(screen.getByRole('button', { name: 'Next file' }));
    expect(h.onChange).toHaveBeenLastCalledWith('clip.mp4');
    await user.click(screen.getByRole('button', { name: 'Previous file' }));
    expect(h.onChange).toHaveBeenLastCalledWith('photo.png');

    await user.keyboard('{ArrowRight}');
    expect(h.onChange).toHaveBeenLastCalledWith('clip.mp4');
    await user.keyboard('{ArrowLeft}');
    expect(h.onChange).toHaveBeenLastCalledWith('photo.png');
  });

  it('has nothing before the first file or after the last', () => {
    const { unmount } = setup(photo.key);
    expect(screen.getByRole('button', { name: 'Previous file' })).toBeDisabled();
    unmount();
    setup(paper.key);
    expect(screen.getByRole('button', { name: 'Next file' })).toBeDisabled();
  });

  it('downloads the file and closes with Escape', async () => {
    const user = userEvent.setup();
    const { h } = setup();
    await user.click(screen.getByRole('button', { name: 'Download' }));
    expect(h.onDownload).toHaveBeenCalledWith('photo.png', 'photo.png');
    await user.keyboard('{Escape}');
    expect(h.onClose).toHaveBeenCalled();
  });

  it('shows a Markdown file formatted, with the source one click away', async () => {
    const user = userEvent.setup();
    stubText('# Release notes\n\n- **fast** search\n');
    const readme = makeFile('README.md', { content_type: 'text/markdown' });
    render(
      <PreviewDialog
        files={[readme]}
        currentKey={readme.key}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    expect(await screen.findByRole('heading', { name: 'Release notes' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Formatted' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Source' }));
    expect(screen.queryByRole('heading', { name: 'Release notes' })).not.toBeInTheDocument();
    expect(screen.getByLabelText('File contents')).toHaveTextContent('# Release notes');
    expect(screen.getByRole('button', { name: 'Source' })).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Formatted' }));
    expect(await screen.findByRole('heading', { name: 'Release notes' })).toBeInTheDocument();
  });

  it('colours the syntax of a code file', async () => {
    stubText('def run():\n    return 1\n');
    const script = makeFile('run.py', { content_type: 'text/x-python' });
    render(
      <PreviewDialog
        files={[script]}
        currentKey={script.key}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );

    const box = await screen.findByLabelText('File contents');
    await waitFor(() => expect(box.querySelector('.hljs-keyword')).toHaveTextContent('def'));
  });

  it('offers no Formatted / Source switch for files that are not Markdown', async () => {
    stubText('plain');
    render(
      <PreviewDialog
        files={[notes]}
        currentKey={notes.key}
        onChange={vi.fn()}
        onClose={vi.fn()}
        onDownload={vi.fn()}
      />,
    );
    await screen.findByLabelText('File contents');
    expect(screen.queryByRole('button', { name: 'Formatted' })).not.toBeInTheDocument();
  });
});
