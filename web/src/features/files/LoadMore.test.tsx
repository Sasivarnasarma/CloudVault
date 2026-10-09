import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LoadMore } from './LoadMore';

const base = { hasMore: true, loading: false, error: null, loadedCount: 500, onLoadMore: () => {} };

describe('LoadMore', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('renders nothing when everything is loaded', () => {
    const { container } = render(<LoadMore {...base} hasMore={false} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows how much is loaded and a button to load more', async () => {
    const onLoadMore = vi.fn();
    render(<LoadMore {...base} onLoadMore={onLoadMore} />);
    expect(screen.getByText('Showing the first 500 items')).toBeInTheDocument();
    await userEvent.click(screen.getByRole('button', { name: 'Load more' }));
    expect(onLoadMore).toHaveBeenCalledTimes(1);
  });

  it('shows progress while loading and hides the button', () => {
    render(<LoadMore {...base} loading />);
    expect(screen.getByRole('status')).toHaveTextContent('Loading more…');
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('shows the error and offers a retry', async () => {
    const onLoadMore = vi.fn();
    render(<LoadMore {...base} error="Failed to load more items" onLoadMore={onLoadMore} />);
    expect(screen.getByRole('alert')).toHaveTextContent('Failed to load more items');
    await userEvent.click(screen.getByRole('button', { name: 'Try again' }));
    expect(onLoadMore).toHaveBeenCalled();
  });

  it('loads automatically when scrolled into view', () => {
    let trigger: (entries: Array<{ isIntersecting: boolean }>) => void = () => {};
    const disconnect = vi.fn();
    class FakeObserver {
      constructor(cb: typeof trigger) {
        trigger = cb;
      }
      observe() {}
      disconnect = disconnect;
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);

    const onLoadMore = vi.fn();
    const { unmount } = render(<LoadMore {...base} onLoadMore={onLoadMore} />);
    trigger([{ isIntersecting: false }]);
    expect(onLoadMore).not.toHaveBeenCalled();
    trigger([{ isIntersecting: true }]);
    expect(onLoadMore).toHaveBeenCalledTimes(1);

    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  it('does not observe while a request is running or after an error', () => {
    const observe = vi.fn();
    class FakeObserver {
      observe = observe;
      disconnect() {}
    }
    vi.stubGlobal('IntersectionObserver', FakeObserver);
    render(<LoadMore {...base} loading />);
    render(<LoadMore {...base} error="boom" />);
    expect(observe).not.toHaveBeenCalled();
  });
});
