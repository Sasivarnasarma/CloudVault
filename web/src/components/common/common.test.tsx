import { fireEvent, render, screen } from '@testing-library/react';
import { FolderOpen } from 'lucide-react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { entryDragData } from '../../test/dataTransfer';
import { Breadcrumbs } from './Breadcrumbs';
import { Button, IconButton } from './Button';
import { Checkbox } from './Checkbox';
import { ConfirmDialog } from './ConfirmDialog';
import { Kbd, KeyCombo } from './Kbd';
import { Spinner } from './Spinner';
import { StateMessage } from './StateMessage';

describe('Breadcrumbs', () => {
  it('shows the root label and every folder in the path', () => {
    render(<Breadcrumbs currentPrefix="docs/2026/q1/" rootLabel="All files" onNavigate={() => {}} />);
    const buttons = screen.getAllByRole('button').map((b) => b.textContent);
    expect(buttons).toEqual(['All files', 'docs', '2026', 'q1']);
  });

  it('marks only the current folder as the current page', () => {
    render(<Breadcrumbs currentPrefix="docs/2026/" rootLabel="All files" onNavigate={() => {}} />);
    expect(screen.getByRole('button', { name: '2026' })).toHaveAttribute('aria-current', 'page');
    expect(screen.getByRole('button', { name: 'docs' })).not.toHaveAttribute('aria-current');
  });

  it('navigates to the clicked ancestor prefix, or the root', async () => {
    const onNavigate = vi.fn();
    render(<Breadcrumbs currentPrefix="docs/2026/q1/" rootLabel="All files" onNavigate={onNavigate} />);

    await userEvent.click(screen.getByRole('button', { name: 'docs' }));
    expect(onNavigate).toHaveBeenLastCalledWith('docs/');
    await userEvent.click(screen.getByRole('button', { name: '2026' }));
    expect(onNavigate).toHaveBeenLastCalledWith('docs/2026/');
    await userEvent.click(screen.getByRole('button', { name: 'All files' }));
    expect(onNavigate).toHaveBeenLastCalledWith('');
  });

  it('renders only the root at the top level', () => {
    render(<Breadcrumbs currentPrefix="" rootLabel="All files" onNavigate={() => {}} />);
    expect(screen.getAllByRole('button')).toHaveLength(1);
    expect(screen.getByRole('button', { name: 'All files' })).toHaveAttribute('aria-current', 'page');
  });
});

describe('Breadcrumbs as drop targets', () => {
  const setup = (dragActive: boolean, currentPrefix = 'docs/2026/q1/') => {
    const onDropToPrefix = vi.fn();
    render(
      <Breadcrumbs
        currentPrefix={currentPrefix}
        rootLabel="All files"
        onNavigate={() => {}}
        dragActive={dragActive}
        onDropToPrefix={onDropToPrefix}
      />,
    );
    return onDropToPrefix;
  };
  const drop = (name: string) =>
    fireEvent.drop(screen.getByRole('button', { name }), { dataTransfer: entryDragData() });

  it('accepts drops on the root and on every parent folder', () => {
    const onDropToPrefix = setup(true);
    drop('All files');
    drop('docs');
    drop('2026');
    expect(onDropToPrefix.mock.calls).toEqual([[''], ['docs/'], ['docs/2026/']]);
  });

  it('does not accept a drop on the folder you are already in', () => {
    const onDropToPrefix = setup(true);
    drop('q1');
    expect(onDropToPrefix).not.toHaveBeenCalled();
  });

  it('highlights the folder under the pointer', () => {
    setup(true);
    fireEvent.dragEnter(screen.getByRole('button', { name: 'docs' }), { dataTransfer: entryDragData() });
    expect(screen.getByRole('button', { name: 'docs' })).toHaveClass('ring-2');
    expect(screen.getByRole('button', { name: 'q1' })).not.toHaveClass('ring-2');
  });

  it('ignores drops when nothing is being dragged', () => {
    const onDropToPrefix = setup(false);
    drop('docs');
    expect(onDropToPrefix).not.toHaveBeenCalled();
  });
});

describe('Button / IconButton', () => {
  it('defaults to type=button so it never submits a form by accident', () => {
    render(<Button>Save</Button>);
    expect(screen.getByRole('button', { name: 'Save' })).toHaveAttribute('type', 'button');
  });

  it('does not fire clicks when disabled', async () => {
    const onClick = vi.fn();
    render(
      <Button disabled onClick={onClick}>
        Save
      </Button>,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('gives icon buttons an accessible name and tooltip', () => {
    render(<IconButton label="Refresh" />);
    const button = screen.getByRole('button', { name: 'Refresh' });
    expect(button).toHaveAttribute('title', 'Refresh');
  });
});

describe('ConfirmDialog', () => {
  const props = {
    title: 'Delete file?',
    description: '“a.txt” will be permanently deleted.',
    confirmLabel: 'Delete',
  };

  it('renders nothing while closed', () => {
    render(<ConfirmDialog {...props} open={false} onConfirm={() => {}} onCancel={() => {}} />);
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  });

  it('describes the action and routes confirm / cancel', async () => {
    const onConfirm = vi.fn();
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} open onConfirm={onConfirm} onCancel={onCancel} />);

    expect(screen.getByRole('dialog', { name: 'Delete file?' })).toBeInTheDocument();
    expect(screen.getByText(props.description)).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Delete' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('cancels with Escape', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} open onConfirm={() => {}} onCancel={onCancel} />);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('blocks both buttons and Escape while the deletion is running', async () => {
    const onCancel = vi.fn();
    render(<ConfirmDialog {...props} open loading onConfirm={() => {}} onCancel={onCancel} />);

    expect(screen.getByRole('button', { name: 'Deleting…' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Cancel' })).toBeDisabled();
    await userEvent.keyboard('{Escape}');
    expect(onCancel).not.toHaveBeenCalled();
  });
});

describe('Spinner', () => {
  it('spins at the default size and takes a different size', () => {
    const { container } = render(<Spinner className="size-6" aria-label="Loading" />);
    const icon = container.querySelector('svg')!;
    expect(icon).toHaveClass('animate-spin', 'size-6');
    expect(icon).not.toHaveClass('size-4');
  });
});

describe('Kbd / KeyCombo', () => {
  it('shows a shortcut as separate key caps', () => {
    const { container } = render(<KeyCombo chord="mod+shift+u" />);
    expect([...container.querySelectorAll('kbd')].map((k) => k.textContent)).toEqual(['Ctrl', 'Shift', 'U']);
  });

  it('shows one key with the style of its variant', () => {
    render(<Kbd variant="hint">/</Kbd>);
    expect(screen.getByText('/')).toHaveClass('font-mono', 'text-ink-3');
  });
});

describe('StateMessage', () => {
  it('shows an icon, a title, a description and an optional action', () => {
    render(
      <StateMessage icon={FolderOpen} title="Nothing here" description="Add something.">
        <button type="button">Add</button>
      </StateMessage>,
    );
    expect(screen.getByRole('heading', { name: 'Nothing here' })).toBeInTheDocument();
    expect(screen.getByText('Add something.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeInTheDocument();
  });

  it('styles an error differently from an empty state', () => {
    const { container } = render(<StateMessage icon={FolderOpen} tone="danger" title="Oops" description="Failed" />);
    expect(container.querySelector('.bg-danger-soft')).not.toBeNull();
  });
});

describe('Checkbox', () => {
  it('is a checkbox that reports its state and its name', () => {
    render(<Checkbox checked label="Select a.txt" onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Select a.txt' })).toHaveAttribute('aria-checked', 'true');
  });

  it('can be partly checked', () => {
    render(<Checkbox checked={false} indeterminate label="Select all" onChange={() => {}} />);
    expect(screen.getByRole('checkbox', { name: 'Select all' })).toHaveAttribute('aria-checked', 'mixed');
  });

  it('changes on click without passing the click on to what it sits in', async () => {
    const onChange = vi.fn();
    const onParentClick = vi.fn();
    render(
      <div onClick={onParentClick}>
        <Checkbox checked={false} label="Select a.txt" onChange={onChange} />
      </div>,
    );
    await userEvent.click(screen.getByRole('checkbox', { name: 'Select a.txt' }));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onParentClick).not.toHaveBeenCalled();
  });

  it('can be left out of the tab order', () => {
    render(<Checkbox checked={false} label="Select a.txt" onChange={() => {}} tabbable={false} />);
    expect(screen.getByRole('checkbox')).toHaveAttribute('tabindex', '-1');
  });
});
