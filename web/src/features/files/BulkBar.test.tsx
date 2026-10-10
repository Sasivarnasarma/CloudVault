import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { BulkBar } from './BulkBar';

const file = (name: string): Entry => ({ type: 'file', id: name, name, file: makeFile(name) });
const folder = (name: string): Entry => ({ type: 'folder', id: `${name}/`, name, folder: makeFolder(name) });

function setup(entries: Entry[], busy = false) {
  const h = {
    onMove: vi.fn(),
    onCopy: vi.fn(),
    onDownloadZip: vi.fn(),
    onDelete: vi.fn(),
    onClear: vi.fn(),
  };
  render(<BulkBar entries={entries} busy={busy} {...h} />);
  return h;
}

describe('BulkBar', () => {
  it('is hidden without a selection', () => {
    setup([]);
    expect(screen.queryByRole('toolbar')).not.toBeInTheDocument();
  });

  it('shows how many items are selected and what they are', () => {
    setup([file('a'), file('b'), folder('Docs')]);
    expect(screen.getByRole('toolbar', { name: 'Actions for selected items' })).toBeInTheDocument();
    expect(screen.getByText('3 selected')).toBeInTheDocument();
    expect(screen.getByText('(2 files and 1 folder)')).toBeInTheDocument();
  });

  it('wires up move, copy, delete and clear', async () => {
    const h = setup([file('a'), file('b')]);
    await userEvent.click(screen.getByRole('button', { name: 'Move to…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Copy to…' }));
    await userEvent.click(screen.getByRole('button', { name: 'Download as zip' }));
    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    await userEvent.click(screen.getByRole('button', { name: 'Clear selection' }));
    expect([h.onMove, h.onCopy, h.onDownloadZip, h.onDelete, h.onClear].map((fn) => fn.mock.calls.length)).toEqual([
      1, 1, 1, 1, 1,
    ]);
  });

  it('disables the actions while one is running', () => {
    setup([file('a'), file('b')], true);
    for (const name of ['Move to…', 'Copy to…', 'Download as zip', 'Delete']) {
      expect(screen.getByRole('button', { name })).toBeDisabled();
    }
  });
});
