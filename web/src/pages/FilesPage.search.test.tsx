import { installPageMocks, renderPage, NESTED } from './filesPage.testkit';
import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { searchObjects } from '../services/objectService';
import { makeFile, makeFolder } from '../test/fixtures';
import { FilesPage } from './FilesPage';

beforeEach(installPageMocks);

const DEEP = makeFile('Reports/2025/q1-report.pdf', { name: 'q1-report.pdf', content_type: 'application/pdf' });
const DEEP_FOLDER = makeFolder('reports-archive', 'Photos/');

describe('FilesPage: searching the subfolders', () => {
  it('only filters the open folder until the subfolder toggle is on', async () => {
    const user = await renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'report');
    expect(screen.getByText('report.pdf')).toBeInTheDocument();
    expect(searchObjects).not.toHaveBeenCalled();
  });

  it('searches the bucket below this folder and lists what it finds with where it is', async () => {
    vi.mocked(searchObjects).mockResolvedValue({
      query: 'report',
      prefix: '',
      folders: [DEEP_FOLDER],
      objects: [DEEP],
      truncated: false,
    });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Include subfolders in the search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'report');

    expect(await screen.findByText('q1-report.pdf')).toBeInTheDocument();
    expect(screen.getByText('in Reports/2025')).toBeInTheDocument();
    expect(screen.getByText('reports-archive')).toBeInTheDocument();
    expect(screen.getByText('in Photos')).toBeInTheDocument();
    // The open folder's own entries give way to the results.
    expect(screen.queryByText('photo.png')).not.toBeInTheDocument();
    expect(searchObjects).toHaveBeenLastCalledWith('report', '', expect.any(AbortSignal));
  });

  it('waits for a pause in typing before asking the API', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Include subfolders in the search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'repo');
    await waitFor(() => expect(searchObjects).toHaveBeenCalled());
    expect(vi.mocked(searchObjects).mock.calls.every((c) => c[0] === 'repo')).toBe(true);
  });

  it('says when there were more matches than it returned', async () => {
    vi.mocked(searchObjects).mockResolvedValue({
      query: 'r',
      prefix: '',
      folders: [],
      objects: [DEEP],
      truncated: true,
    });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Include subfolders in the search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'r');
    expect(await screen.findByText(/Showing the first 300 matches/)).toBeInTheDocument();
  });

  it('shows the error when the search fails, and leaves the folder alone when it is cleared', async () => {
    vi.mocked(searchObjects).mockRejectedValue(new Error('Storage service is unavailable'));
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Include subfolders in the search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'zzz');
    expect(await screen.findByRole('alert')).toHaveTextContent('Storage service is unavailable');

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(await screen.findByText('photo.png')).toBeInTheDocument();
  });

  it('opens the folder a result is in by opening that folder result', async () => {
    vi.mocked(searchObjects).mockResolvedValue({
      query: 'rep',
      prefix: '',
      folders: [makeFolder('Reports')],
      objects: [],
      truncated: false,
    });
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Include subfolders in the search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'rep');
    await user.dblClick(await screen.findByText('Reports'));
    expect(await screen.findByText(NESTED.name)).toBeInTheDocument();
    // The search belongs to the folder it was typed in.
    expect(screen.getByRole('searchbox', { name: 'Search this folder' })).toHaveValue('');
  });

  it('keeps the search in the address, and brings it back when the page is opened from it', async () => {
    const user = await renderPage();
    await user.click(screen.getByRole('button', { name: 'Include subfolders in the search' }));
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'rep');
    await waitFor(() => expect(window.location.search).toBe('?q=rep&deep=1'));

    await user.click(screen.getByRole('button', { name: 'Clear search' }));
    await waitFor(() => expect(window.location.search).toBe(''));
  });

  it('starts with the search that is in the address', async () => {
    window.history.replaceState(null, '', '/?q=report&deep=1');
    vi.mocked(searchObjects).mockResolvedValue({
      query: 'report',
      prefix: '',
      folders: [],
      objects: [DEEP],
      truncated: false,
    });
    render(<FilesPage />);

    expect(await screen.findByText('q1-report.pdf')).toBeInTheDocument();
    expect(screen.getByRole('searchbox', { name: 'Search this folder' })).toHaveValue('report');
    expect(screen.getByRole('button', { name: 'Include subfolders in the search' })).toHaveAttribute(
      'aria-pressed',
      'true',
    );
    expect(searchObjects).toHaveBeenCalledWith('report', '', expect.any(AbortSignal));
  });

  it('drops the search from the address when a folder is opened', async () => {
    const user = await renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'rep');
    await waitFor(() => expect(window.location.search).toBe('?q=rep'));
    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText(NESTED.name);
    expect(window.location.search).toBe('?p=Reports');
  });

  it('brings the search back with the Back button', async () => {
    const user = await renderPage();
    await user.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'rep');
    await waitFor(() => expect(window.location.search).toBe('?q=rep'));
    await user.dblClick(screen.getByText('Reports'));
    await screen.findByText(NESTED.name);

    window.history.replaceState(null, '', '/?q=rep');
    window.dispatchEvent(new PopStateEvent('popstate'));
    expect(await screen.findByRole('searchbox', { name: 'Search this folder' })).toHaveValue('rep');
  });
});
