import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { Entry } from '../../lib/entries';
import { makeFile, makeFolder } from '../../test/fixtures';
import { ClipboardBar } from './ClipboardBar';

const file = (name: string): Entry => ({ type: 'file', id: name, name, file: makeFile(name) });
const folder = (name: string): Entry => ({ type: 'folder', id: `${name}/`, name, folder: makeFolder(name) });

function setup(props: Partial<React.ComponentProps<typeof ClipboardBar>> = {}) {
  const h = { onPaste: vi.fn(), onClear: vi.fn() };
  render(
    <ClipboardBar
      clipboard={{ mode: 'copy', entries: [file('a.txt'), file('b.txt'), folder('Docs')] }}
      destination="Reports"
      canPaste
      {...h}
      {...props}
    />,
  );
  return h;
}

describe('ClipboardBar', () => {
  it('is hidden while the clipboard is empty', () => {
    setup({ clipboard: null });
    expect(screen.queryByRole('region', { name: 'Clipboard' })).not.toBeInTheDocument();
  });

  it('says what was copied and where it will be pasted', () => {
    setup();
    expect(screen.getByRole('region', { name: 'Clipboard' })).toBeInTheDocument();
    expect(screen.getByText('2 files and 1 folder copied')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Paste into Reports/ })).toBeEnabled();
  });

  it('says that cut items are ready to move', () => {
    setup({ clipboard: { mode: 'cut', entries: [file('a.txt')] } });
    expect(screen.getByText('1 file ready to move')).toBeInTheDocument();
  });

  it('pastes and clears from its buttons', async () => {
    const h = setup();
    await userEvent.click(screen.getByRole('button', { name: /Paste into/ }));
    expect(h.onPaste).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Clear clipboard' }));
    expect(h.onClear).toHaveBeenCalledTimes(1);
  });

  it('disables pasting, and says why, when it would do nothing', async () => {
    const h = setup({ canPaste: false });
    expect(screen.getByRole('button', { name: /Paste into/ })).toBeDisabled();
    expect(screen.getByText('Already in this folder')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: /Paste into/ }));
    expect(h.onPaste).not.toHaveBeenCalled();
  });

  it('disables pasting while a paste is running', () => {
    setup({ busy: true });
    expect(screen.getByRole('button', { name: /Paste into/ })).toBeDisabled();
  });
});
