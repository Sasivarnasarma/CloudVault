import { ChevronLeft, ChevronRight, Download } from 'lucide-react';
import { lazy, Suspense, useEffect, useState } from 'react';
import { Button, IconButton } from '../../components/common/Button';
import { Dialog } from '../../components/common/Dialog';
import { Spinner } from '../../components/common/Spinner';
import { formatBytes } from '../../lib/formatters';
import { cn } from '../../lib/cn';
import { isMarkdown, previewKindOf, type PreviewKind } from '../../lib/previewKind';
import { requestPresignedDownload } from '../../services/objectService';
import type { FileObject } from '../../types';
import { CodeView } from './CodeView';
import { languageFor } from './highlight';
import { readTextHead, type TextHead } from './readTextHead';

// The Markdown renderer is a sizeable library, fetched only when a Markdown file is previewed.
const MarkdownView = lazy(() => import('./MarkdownView'));

/** How much of a text file is shown. */
export const TEXT_PREVIEW_BYTES = 256 * 1024;

interface PreviewDialogProps {
  /** The previewable files of the folder, in the order they are listed. */
  files: FileObject[];
  /** Key of the file being previewed, or null while the dialog is closed. */
  currentKey: string | null;
  onChange: (key: string) => void;
  onClose: () => void;
  onDownload: (key: string, name: string) => void;
}

/** A temporary link to read the file from storage directly. */
function useFileUrl(key: string): { url?: string; failed?: boolean } {
  const [state, setState] = useState<{ key: string; url?: string; failed?: boolean } | null>(null);
  useEffect(() => {
    let cancelled = false;
    requestPresignedDownload(key)
      .then((res) => !cancelled && setState({ key, url: res.download_url }))
      .catch(() => !cancelled && setState({ key, failed: true }));
    return () => {
      cancelled = true;
    };
  }, [key]);
  return state?.key === key ? state : {};
}

function Message({ children }: { children: React.ReactNode }) {
  return <p className="px-6 text-center text-sm text-ink-3">{children}</p>;
}

function TextBody({ url, name }: { url: string; name: string }) {
  const [state, setState] = useState<{ head: TextHead } | { failed: true } | null>(null);
  const markdown = isMarkdown(name);
  const [showSource, setShowSource] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    readTextHead(url, TEXT_PREVIEW_BYTES, controller.signal)
      .then((head) => setState({ head }))
      .catch(() => !controller.signal.aborted && setState({ failed: true }));
    return () => controller.abort();
  }, [url]);

  if (!state) return <Spinner className="size-5 text-ink-3" aria-label="Loading preview" />;
  if ('failed' in state) return <Message>Couldn’t read this file. Try downloading it instead.</Message>;
  const { text, truncated } = state.head;
  if (text.includes('\u0000')) return <Message>This file isn’t text, so it can’t be previewed.</Message>;
  const formatted = markdown && !showSource;
  return (
    <div className="flex size-full flex-col">
      {markdown && (
        <div role="group" aria-label="Show" className="flex gap-1 border-b border-line p-2">
          {[
            { label: 'Formatted', on: formatted, set: () => setShowSource(false) },
            { label: 'Source', on: !formatted, set: () => setShowSource(true) },
          ].map(({ label, on, set }) => (
            <button
              key={label}
              type="button"
              aria-pressed={on}
              onClick={set}
              className={cn(
                'rounded-md px-2.5 py-1 text-xs font-medium transition',
                on ? 'bg-surface-2 text-ink shadow-card' : 'text-ink-3 hover:text-ink',
              )}
            >
              {label}
            </button>
          ))}
        </div>
      )}
      {formatted ? (
        <Suspense fallback={<Spinner className="m-auto size-5 text-ink-3" aria-label="Loading preview" />}>
          <MarkdownView text={text} />
        </Suspense>
      ) : (
        <CodeView text={text} language={languageFor(name)} />
      )}
      {truncated && (
        <p className="border-t border-line px-4 py-2 text-xs text-ink-3">
          Showing the first {formatBytes(TEXT_PREVIEW_BYTES)}. Download the file to see the rest.
        </p>
      )}
    </div>
  );
}

function Viewer({ file, kind, url }: { file: FileObject; kind: PreviewKind; url: string }) {
  const [broken, setBroken] = useState(false);
  if (broken) return <Message>Your browser can’t show this file. Try downloading it instead.</Message>;
  const onError = () => setBroken(true);

  switch (kind) {
    case 'image':
      return <img src={url} alt={file.name} onError={onError} className="max-h-full max-w-full object-contain" />;
    case 'video':
      return <video src={url} controls onError={onError} className="max-h-full max-w-full" />;
    case 'audio':
      return <audio src={url} controls onError={onError} className="w-[min(32rem,90%)]" />;
    case 'pdf':
      return <iframe src={url} title={file.name} className="size-full border-0 bg-white" />;
    case 'text':
      return <TextBody url={url} name={file.name} />;
  }
}

/** The part that depends on the file; keyed by the file so each one starts with a clean state. */
function PreviewBody({ file }: { file: FileObject }) {
  const { url, failed } = useFileUrl(file.key);
  const kind = previewKindOf(file);
  if (failed) return <Message>Couldn’t load a preview.</Message>;
  if (!url || !kind) return <Spinner className="size-5 text-ink-3" aria-label="Loading preview" />;
  return <Viewer file={file} kind={kind} url={url} />;
}

/** Keys that mean something else in a video, an audio player, a field or the PDF viewer. */
const KEEPS_ARROWS = 'video, audio, input, textarea, iframe, pre';

/** Look at a file without downloading it: images, video, audio, PDFs and text, with previous / next. */
export function PreviewDialog({ files, currentKey, onChange, onClose, onDownload }: PreviewDialogProps) {
  const index = files.findIndex((f) => f.key === currentKey);
  const file = index >= 0 ? files[index] : null;
  const previous = index > 0 ? files[index - 1] : null;
  const next = index >= 0 && index < files.length - 1 ? files[index + 1] : null;

  useEffect(() => {
    if (!file) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || e.shiftKey) return;
      if ((e.target as Element | null)?.closest?.(KEEPS_ARROWS)) return;
      const target = e.key === 'ArrowLeft' ? previous : e.key === 'ArrowRight' ? next : null;
      if (!target) return;
      e.preventDefault();
      onChange(target.key);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [file, previous, next, onChange]);

  return (
    <Dialog
      open={file !== null}
      onOpenChange={(open) => !open && onClose()}
      title={file?.name ?? 'Preview'}
      description={file ? `${formatBytes(file.size)} · ${index + 1} of ${files.length}` : undefined}
      className="max-w-5xl"
    >
      {file && (
        <>
          <div className="flex h-[65vh] items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken">
            <PreviewBody key={file.key} file={file} />
          </div>
          <div className="mt-4 flex items-center justify-between gap-2">
            <div className="flex gap-1">
              <IconButton label="Previous file" disabled={!previous} onClick={() => previous && onChange(previous.key)}>
                <ChevronLeft className="size-4" />
              </IconButton>
              <IconButton label="Next file" disabled={!next} onClick={() => next && onChange(next.key)}>
                <ChevronRight className="size-4" />
              </IconButton>
            </div>
            <Button variant="primary" onClick={() => onDownload(file.key, file.name)}>
              <Download className="size-4" />
              Download
            </Button>
          </div>
        </>
      )}
    </Dialog>
  );
}
