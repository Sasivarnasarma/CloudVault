import { render, screen, waitFor } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import * as highlighter from './highlight';
import { CodeView } from './CodeView';
import MarkdownView from './MarkdownView';

describe('CodeView', () => {
  it('shows plain text at once and colours it a moment later', async () => {
    render(<CodeView text={'def f():\n    pass\n'} language="python" />);
    const box = screen.getByLabelText('File contents');
    expect(box).toHaveTextContent('def f():');

    await waitFor(() => expect(box.querySelector('.hljs-keyword')).toHaveTextContent('def'));
    expect(box).toHaveTextContent('pass'); // the text itself is unchanged
  });

  it('leaves text without a language as it is', () => {
    render(<CodeView text="just words <b>not bold</b>" language={null} />);
    expect(screen.getByLabelText('File contents')).toHaveTextContent('just words <b>not bold</b>');
    expect(document.querySelector('.hljs-keyword')).toBeNull();
  });

  it('keeps the plain text when the highlighter fails', async () => {
    const spy = vi.spyOn(highlighter, 'highlight').mockRejectedValue(new Error('chunk failed to load'));
    render(<CodeView text="x = 1" language="python" />);
    await waitFor(() => expect(spy).toHaveBeenCalled());
    expect(screen.getByLabelText('File contents')).toHaveTextContent('x = 1');
    spy.mockRestore();
  });

  it('does not show colours of the previous file on the next one', async () => {
    const { rerender } = render(<CodeView text="def a(): pass" language="python" />);
    await waitFor(() => expect(document.querySelector('.hljs-keyword')).not.toBeNull());

    rerender(<CodeView text="plain next file" language="python" />);
    expect(screen.getByLabelText('File contents')).toHaveTextContent('plain next file');
    expect(screen.getByLabelText('File contents')).not.toHaveTextContent('def a');
  });
});

describe('MarkdownView', () => {
  const md = (text: string) => render(<MarkdownView text={text} />);

  it('formats headings, lists, emphasis and code', () => {
    md('# Title\n\nSome *emphasis* and `code`.\n\n- one\n- two\n\n1. first\n2. second\n');
    expect(screen.getByRole('heading', { level: 1, name: 'Title' })).toBeInTheDocument();
    expect(screen.getAllByRole('listitem')).toHaveLength(4);
    expect(screen.getByText('emphasis').tagName).toBe('EM');
    expect(screen.getByText('code').tagName).toBe('CODE');
  });

  it('formats tables and task lists', () => {
    md('| a | b |\n|---|---|\n| 1 | 2 |\n\n- [x] done\n- [ ] todo\n');
    expect(screen.getByRole('table')).toBeInTheDocument();
    expect(screen.getByRole('columnheader', { name: 'a' })).toBeInTheDocument();
    const boxes = screen.getAllByRole('checkbox');
    expect(boxes.map((b) => (b as HTMLInputElement).checked)).toEqual([true, false]);
  });

  it('opens links in a new tab without handing over the page', () => {
    md('[docs](https://example.com/docs)');
    const link = screen.getByRole('link', { name: 'docs' });
    expect(link).toHaveAttribute('href', 'https://example.com/docs');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
    expect(link.getAttribute('rel')).toContain('noreferrer');
  });

  it('does not load pictures, which could tell another site that the file was opened', () => {
    md('![a tracking pixel](https://tracker.example/pixel.gif)');
    expect(document.querySelector('img')).toBeNull();
    expect(screen.getByText('[image: a tracking pixel]')).toBeInTheDocument();
  });

  it('does not run HTML or scripts inside the file', () => {
    md(
      'Hello <script>window.__ran = true</script><b onclick="window.__ran = true">bold</b>\n\n<iframe src="https://x.test"></iframe>',
    );
    expect(document.querySelector('script')).toBeNull();
    expect(document.querySelector('iframe')).toBeNull();
    expect(document.querySelector('b')).toBeNull();
    expect((window as unknown as { __ran?: boolean }).__ran).toBeUndefined();
  });

  it('does not make a link of a javascript: address', () => {
    md('[click](javascript:alert(1))');
    const link = screen.queryByRole('link');
    expect(link?.getAttribute('href') ?? '').not.toMatch(/^javascript:/i);
  });
});
