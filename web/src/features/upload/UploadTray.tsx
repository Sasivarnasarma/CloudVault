import { AlertCircle, CheckCircle2, ChevronDown, CopyX, Loader2, X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import { useState } from 'react';
import { Button, IconButton } from '../../components/common/Button';
import { cn } from '../../lib/cn';
import { formatBytes } from '../../lib/formatters';
import type { UploadItem } from './useUpload';

interface UploadTrayProps {
  queue: UploadItem[];
  isUploading: boolean;
  onClear: () => void;
  onReplace: (item: UploadItem) => void;
  onSkip: (id: string) => void;
}

function StatusIcon({ status }: { status: UploadItem['status'] }) {
  if (status === 'completed') return <CheckCircle2 className="size-4 text-accent" aria-label="Uploaded" />;
  if (status === 'error') return <AlertCircle className="size-4 text-danger" aria-label="Failed" />;
  if (status === 'conflict') return <CopyX className="size-4 text-folder-deep" aria-label="Already exists" />;
  if (status === 'uploading') return <Loader2 className="size-4 animate-spin text-ink-2" aria-label="Uploading" />;
  return <span className="size-2 rounded-full bg-line-strong" aria-label="Waiting" />;
}

function heading(queue: UploadItem[], isUploading: boolean): string {
  const done = queue.filter((q) => q.status === 'completed').length;
  const conflicts = queue.filter((q) => q.status === 'conflict').length;
  const failed = queue.filter((q) => q.status === 'error').length;

  if (isUploading) return `Uploading ${Math.min(done + conflicts + failed + 1, queue.length)} of ${queue.length}`;
  if (conflicts) return `${conflicts} file${conflicts === 1 ? '' : 's'} already exist${conflicts === 1 ? 's' : ''}`;
  if (failed) return `${done} uploaded, ${failed} failed`;
  return `${done} upload${done === 1 ? '' : 's'} complete`;
}

export function UploadTray({ queue, isUploading, onClear, onReplace, onSkip }: UploadTrayProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <AnimatePresence>
      {queue.length > 0 && (
        <motion.section
          aria-label="Uploads"
          initial={{ opacity: 0, y: 24, scale: 0.97 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 24, scale: 0.97 }}
          transition={{ type: 'spring', stiffness: 380, damping: 32 }}
          className="fixed bottom-4 right-4 z-40 w-[min(22rem,calc(100vw-2rem))] overflow-hidden rounded-2xl border border-line bg-surface-2 shadow-pop"
        >
          <header className="flex items-center gap-2 px-4 py-2.5">
            <h2 className="flex-1 text-sm font-semibold text-ink" aria-live="polite">
              {heading(queue, isUploading)}
            </h2>
            <IconButton
              label={collapsed ? 'Expand uploads' : 'Collapse uploads'}
              className="size-8"
              onClick={() => setCollapsed((c) => !c)}
            >
              <ChevronDown className={cn('size-4 transition', collapsed && 'rotate-180')} />
            </IconButton>
            <IconButton label="Dismiss uploads" className="size-8" onClick={onClear} disabled={isUploading}>
              <X className="size-4" />
            </IconButton>
          </header>

          {!collapsed && (
            <ul className="max-h-64 divide-y divide-line overflow-y-auto border-t border-line">
              {queue.map((item) => (
                <li key={item.id} className="px-4 py-2.5">
                  <div className="flex items-center gap-2.5">
                    <StatusIcon status={item.status} />
                    <span className="flex-1 truncate text-sm text-ink" title={item.file.name}>
                      {item.file.name}
                    </span>
                    <span className="font-mono text-xs text-ink-3">{formatBytes(item.file.size, 1)}</span>
                  </div>
                  {item.status === 'uploading' && (
                    <div
                      role="progressbar"
                      aria-valuenow={item.progress}
                      aria-valuemin={0}
                      aria-valuemax={100}
                      className="mt-2 h-1 overflow-hidden rounded-full bg-sunken"
                    >
                      <motion.div
                        className="h-full rounded-full bg-accent"
                        animate={{ width: `${item.progress}%` }}
                        transition={{ ease: 'easeOut', duration: 0.2 }}
                      />
                    </div>
                  )}
                  {item.status === 'error' && <p className="mt-1 pl-6.5 text-xs text-danger">{item.errorMsg}</p>}
                  {item.status === 'conflict' && (
                    <div className="mt-1.5 pl-6.5">
                      <p className="text-xs text-ink-3">{item.errorMsg}</p>
                      <div className="mt-1.5 flex gap-2">
                        <Button
                          variant="secondary"
                          className="h-7 px-2.5 text-xs"
                          disabled={isUploading}
                          onClick={() => onReplace(item)}
                          aria-label={`Replace ${item.file.name}`}
                        >
                          Replace
                        </Button>
                        <Button
                          variant="ghost"
                          className="h-7 px-2.5 text-xs"
                          disabled={isUploading}
                          onClick={() => onSkip(item.id)}
                          aria-label={`Skip ${item.file.name}`}
                        >
                          Skip
                        </Button>
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </motion.section>
      )}
    </AnimatePresence>
  );
}
