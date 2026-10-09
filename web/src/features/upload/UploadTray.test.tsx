import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { UploadItem } from './useUpload';
import { UploadTray } from './UploadTray';

const item = (name: string, status: UploadItem['status'], extra: Partial<UploadItem> = {}): UploadItem => ({
  id: name,
  file: new File(['x'.repeat(2048)], name),
  key: name,
  progress: 0,
  status,
  ...extra,
});

describe('UploadTray', () => {
  it('renders nothing for an empty queue', () => {
    render(<UploadTray queue={[]} isUploading={false} onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);
    expect(screen.queryByRole('region', { name: 'Uploads' })).not.toBeInTheDocument();
  });

  it('shows overall progress and a progress bar for the active file', () => {
    const queue = [item('a.txt', 'completed', { progress: 100 }), item('b.txt', 'uploading', { progress: 42 }), item('c.txt', 'pending')];
    render(<UploadTray queue={queue} isUploading onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);

    expect(screen.getByText('Uploading 2 of 3')).toBeInTheDocument();
    expect(screen.getByRole('progressbar')).toHaveAttribute('aria-valuenow', '42');
    expect(screen.getByLabelText('Uploaded')).toBeInTheDocument();
    expect(screen.getByLabelText('Waiting')).toBeInTheDocument();
    expect(screen.getAllByText('2 KB')).toHaveLength(3);
  });

  it('cannot be dismissed while uploading', () => {
    render(<UploadTray queue={[item('a.txt', 'uploading')]} isUploading onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('button', { name: 'Dismiss uploads' })).toBeDisabled();
  });

  it('summarizes a finished batch and clears on dismiss', async () => {
    const onClear = vi.fn();
    render(<UploadTray queue={[item('a.txt', 'completed'), item('b.txt', 'completed')]} isUploading={false} onClear={onClear} onReplace={() => {}} onSkip={() => {}} />);

    expect(screen.getByText('2 uploads complete')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Dismiss uploads' }));
    expect(onClear).toHaveBeenCalledTimes(1);
  });

  it('reports failures with the reason', () => {
    const queue = [item('a.txt', 'completed'), item('dup.txt', 'error', { errorMsg: 'A file with this name already exists' })];
    render(<UploadTray queue={queue} isUploading={false} onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);

    expect(screen.getByText('1 uploaded, 1 failed')).toBeInTheDocument();
    expect(screen.getByLabelText('Failed')).toBeInTheDocument();
    expect(screen.getByText('A file with this name already exists')).toBeInTheDocument();
  });

  it('collapses and expands the file list', async () => {
    render(<UploadTray queue={[item('a.txt', 'completed')]} isUploading={false} onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);
    expect(screen.getByText('a.txt')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Collapse uploads' }));
    expect(screen.queryByText('a.txt')).not.toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Expand uploads' }));
    expect(screen.getByText('a.txt')).toBeInTheDocument();
  });

  it('lets the user replace or skip a file that already exists', async () => {
    const onReplace = vi.fn();
    const onSkip = vi.fn();
    const conflict = item('dup.txt', 'conflict', { errorMsg: 'A file with this name already exists' });
    render(<UploadTray queue={[conflict]} isUploading={false} onClear={() => {}} onReplace={onReplace} onSkip={onSkip} />);

    expect(screen.getByText('1 file already exists')).toBeInTheDocument();
    expect(screen.getByText('A file with this name already exists')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Replace dup.txt' }));
    expect(onReplace).toHaveBeenCalledWith(conflict);
    await userEvent.click(screen.getByRole('button', { name: 'Skip dup.txt' }));
    expect(onSkip).toHaveBeenCalledWith('dup.txt');
  });

  it('disables replace and skip while another upload is running', () => {
    const queue = [item('dup.txt', 'conflict', { errorMsg: 'exists' }), item('b.txt', 'uploading')];
    render(<UploadTray queue={queue} isUploading onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);
    expect(screen.getByRole('button', { name: 'Replace dup.txt' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Skip dup.txt' })).toBeDisabled();
  });

  it('uses singular wording for a single upload', () => {
    render(<UploadTray queue={[item('a.txt', 'completed')]} isUploading={false} onClear={() => {}} onReplace={() => {}} onSkip={() => {}} />);
    expect(screen.getByText('1 upload complete')).toBeInTheDocument();
  });
});
