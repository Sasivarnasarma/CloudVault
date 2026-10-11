import type { Components } from 'react-markdown';
import Markdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

/**
 * Pictures are not loaded: a file in your bucket could point at any address, and fetching it would
 * tell that site you looked. The description is shown instead. Links open in a new tab without
 * handing over the page.
 */
const COMPONENTS: Components = {
  img: ({ alt }) => <span className="text-ink-3">[image{alt ? `: ${alt}` : ''}]</span>,
  a: ({ href, children }) => (
    <a href={href} target="_blank" rel="noopener noreferrer nofollow">
      {children}
    </a>
  ),
};

/**
 * A Markdown file as formatted text (headings, lists, tables, code, task lists). Raw HTML inside the
 * file is not rendered, only Markdown, so a file cannot run anything in the page.
 */
export default function MarkdownView({ text }: { text: string }) {
  return (
    <div tabIndex={0} aria-label="Formatted file contents" className="markdown min-h-0 flex-1 overflow-auto p-5">
      <Markdown remarkPlugins={[remarkGfm]} components={COMPONENTS}>
        {text}
      </Markdown>
    </div>
  );
}
