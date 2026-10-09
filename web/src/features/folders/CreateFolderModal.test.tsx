import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ApiError } from '../../services/http';
import { CreateFolderModal } from './CreateFolderModal';

vi.mock('../../services/folderService', () => ({ createFolder: vi.fn() }));
import { createFolder } from '../../services/folderService';

const createMock = vi.mocked(createFolder);

function setup(targetPrefix = 'docs/') {
  const onClose = vi.fn();
  const onFolderCreated = vi.fn();
  render(
    <CreateFolderModal isOpen onClose={onClose} targetPrefix={targetPrefix} onFolderCreated={onFolderCreated} />,
  );
  return { onClose, onFolderCreated, input: screen.getByLabelText('Folder name') };
}

beforeEach(() => {
  createMock.mockReset();
  createMock.mockResolvedValue({ success: true, folder: { name: 'x', prefix: 'x/' } });
});

describe('CreateFolderModal', () => {
  it('disables Create until a name is typed', async () => {
    const { input } = setup();
    const create = screen.getByRole('button', { name: 'Create folder' });
    expect(create).toBeDisabled();
    await userEvent.type(input, 'reports');
    expect(create).toBeEnabled();
  });

  it('creates the folder inside the current folder and closes', async () => {
    const { input, onClose, onFolderCreated } = setup('docs/');
    await userEvent.type(input, '  reports  ');
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    await waitFor(() => expect(onFolderCreated).toHaveBeenCalledWith('reports'));
    expect(createMock).toHaveBeenCalledWith('docs/reports');
    expect(onClose).toHaveBeenCalled();
  });

  it('creates at the root when there is no current folder', async () => {
    const { input } = setup('');
    await userEvent.type(input, 'top{Enter}');
    await waitFor(() => expect(createMock).toHaveBeenCalledWith('top'));
  });

  it.each(['a/b', 'a\\b', 'what?', 'a:b', '..', '.'])('rejects the invalid name %j without calling the API', async (name) => {
    const { input, onClose } = setup();
    await userEvent.type(input, name);
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    expect(await screen.findByRole('alert')).toBeInTheDocument();
    expect(input).toHaveAttribute('aria-invalid', 'true');
    expect(createMock).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('shows the API error (e.g. folder already exists) and stays open', async () => {
    createMock.mockRejectedValueOnce(new ApiError('A folder with this name already exists', 409));
    const { input, onClose, onFolderCreated } = setup();
    await userEvent.type(input, 'taken');
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('A folder with this name already exists');
    expect(onFolderCreated).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('clears the error as soon as the user edits the name', async () => {
    const { input } = setup();
    await userEvent.type(input, 'a/b');
    await userEvent.click(screen.getByRole('button', { name: 'Create folder' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument();

    await userEvent.type(input, 'c');
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('closes with Cancel', async () => {
    const { onClose } = setup();
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
