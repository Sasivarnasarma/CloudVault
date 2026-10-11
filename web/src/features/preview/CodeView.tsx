import { useEffect, useState } from 'react';
import { highlight } from './highlight';

/** Text shown as it is, in the box the preview uses for every kind of text. */
const BOX =
  'min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words p-4 font-mono text-xs leading-relaxed text-ink';

interface CodeViewProps {
  text: string;
  /** The highlighter's name for the language, or null for plain text. */
  language: string | null;
}

/**
 * Text with its syntax coloured. It appears as plain text at once and gets its colours a moment
 * later, so a slow or failed highlighter never leaves the box empty.
 */
export function CodeView({ text, language }: CodeViewProps) {
  const [colored, setColored] = useState<{ text: string; html: string } | null>(null);

  useEffect(() => {
    if (!language) return;
    let cancelled = false;
    highlight(text, language)
      .then((html) => !cancelled && setColored({ text, html }))
      .catch(() => undefined); // keep the plain text
    return () => {
      cancelled = true;
    };
  }, [text, language]);

  if (language && colored?.text === text) {
    return (
      <pre tabIndex={0} aria-label="File contents" className={BOX}>
        {/* highlight.js escapes the code, so this holds nothing but its own <span> tags */}
        <code dangerouslySetInnerHTML={{ __html: colored.html || ' ' }} />
      </pre>
    );
  }
  return (
    <pre tabIndex={0} aria-label="File contents" className={BOX}>
      {text || ' '}
    </pre>
  );
}
