import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Breadcrumbs } from './Breadcrumbs';
import { Button, IconButton } from './Button';
import { ConfirmDialog } from './ConfirmDialog';

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
