import { createRef } from 'react';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type { HealthResponse } from '../../types';
import { Sidebar } from './Sidebar';
import { Toolbar } from './Toolbar';

const health: HealthResponse = {
  status: 'ok',
  app_name: 'CloudVault API',
  version: '0.1.0',
  storage_provider: 'minio',
  bucket: 'my-bucket',
  storage_connected: true,
};

function renderSidebar(overrides: Partial<React.ComponentProps<typeof Sidebar>> = {}) {
  const handlers = {
    onFilterChange: vi.fn(),
    onUpload: vi.fn(),
    onNewFolder: vi.fn(),
    onToggleTheme: vi.fn(),
    onNavigateHome: vi.fn(),
  };
  render(
    <Sidebar
      health={health}
      healthLoading={false}
      healthError={false}
      filter="all"
      counts={{ all: 6, documents: 3, images: 2, media: 1 }}
      theme="light"
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('Sidebar', () => {
  it('lists categories with their counts and marks the active one', () => {
    renderSidebar({ filter: 'images' });
    expect(screen.getByRole('button', { name: /Images/ })).toHaveAttribute('aria-current', 'true');
    expect(screen.getByRole('button', { name: /All files/ })).not.toHaveAttribute('aria-current');
    expect(screen.getByRole('button', { name: /Documents/ })).toHaveTextContent('3');
  });

  it('wires up filters and the primary actions', async () => {
    const { onFilterChange, onUpload, onNewFolder, onNavigateHome } = renderSidebar();
    await userEvent.click(screen.getByRole('button', { name: /Audio & video/ }));
    expect(onFilterChange).toHaveBeenCalledWith('media');
    await userEvent.click(screen.getByRole('button', { name: 'Upload' }));
    expect(onUpload).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Folder' }));
    expect(onNewFolder).toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'CloudVault home' }));
    expect(onNavigateHome).toHaveBeenCalled();
  });

  it('shows the connected bucket and provider', () => {
    renderSidebar();
    expect(screen.getByText('Connected')).toBeInTheDocument();
    expect(screen.getByText('my-bucket')).toBeInTheDocument();
    expect(screen.getByText('minio')).toBeInTheDocument();
  });

  it.each([
    ['connecting', { healthLoading: true, health: null }, 'Connecting…'],
    ['api offline', { healthError: true, health: null }, 'API offline'],
    ['storage down', { health: { ...health, storage_connected: false } }, 'Storage unreachable'],
  ])('reports the %s state', (_name, props, text) => {
    renderSidebar(props);
    expect(screen.getByText(text)).toBeInTheDocument();
  });

  it('offers the opposite theme and toggles it', async () => {
    const { onToggleTheme } = renderSidebar({ theme: 'dark' });
    await userEvent.click(screen.getByRole('button', { name: 'Switch to light theme' }));
    expect(onToggleTheme).toHaveBeenCalled();
  });
});

function renderToolbar(overrides: Partial<React.ComponentProps<typeof Toolbar>> = {}) {
  const handlers = {
    onNavigate: vi.fn(),
    onNavigateUp: vi.fn(),
    onSearchChange: vi.fn(),
    onViewChange: vi.fn(),
    onSortChange: vi.fn(),
    onRefresh: vi.fn(),
    onOpenNav: vi.fn(),
  };
  render(
    <Toolbar
      currentPrefix="docs/"
      rootLabel="All files"
      search=""
      searchRef={createRef<HTMLInputElement>()}
      view="grid"
      sort={{ key: 'name', dir: 'asc' }}
      refreshing={false}
      {...handlers}
      {...overrides}
    />,
  );
  return handlers;
}

describe('Toolbar', () => {
  it('goes up a folder, but not from the root', async () => {
    const { onNavigateUp } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Up one folder' }));
    expect(onNavigateUp).toHaveBeenCalledTimes(1);
  });

  it('disables the up button at the root', () => {
    renderToolbar({ currentPrefix: '' });
    expect(screen.getByRole('button', { name: 'Up one folder' })).toBeDisabled();
  });

  it('reports search input and clears it', async () => {
    const { onSearchChange } = renderToolbar({ search: 'abc' });
    await userEvent.type(screen.getByRole('searchbox', { name: 'Search this folder' }), 'd');
    expect(onSearchChange).toHaveBeenCalledWith('abcd');
    await userEvent.click(screen.getByRole('button', { name: 'Clear search' }));
    expect(onSearchChange).toHaveBeenLastCalledWith('');
  });

  it('switches between grid and list view', async () => {
    const { onViewChange } = renderToolbar({ view: 'grid' });
    expect(screen.getByRole('button', { name: 'Grid view' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'List view' })).toHaveAttribute('aria-pressed', 'false');
    await userEvent.click(screen.getByRole('button', { name: 'List view' }));
    expect(onViewChange).toHaveBeenCalledWith('list');
  });

  it('changes the sort key and direction from the sort menu', async () => {
    const { onSortChange } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'Sort' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Size/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('size');

    await userEvent.click(screen.getByRole('button', { name: 'Sort' }));
    await userEvent.click(await screen.findByRole('menuitem', { name: /Descending/ }));
    expect(onSortChange).toHaveBeenLastCalledWith('name', 'desc');
  });

  it('navigates via the breadcrumb and refreshes', async () => {
    const { onNavigate, onRefresh } = renderToolbar();
    await userEvent.click(screen.getByRole('button', { name: 'All files' }));
    expect(onNavigate).toHaveBeenCalledWith('');
    await userEvent.click(screen.getByRole('button', { name: 'Refresh' }));
    expect(onRefresh).toHaveBeenCalled();
  });
});
