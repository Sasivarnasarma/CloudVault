import { Check, Copy, Download, Trash2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Button, IconButton } from '../../components/common/Button';
import { categoryOf } from '../../lib/fileKind';
import { formatBytes, formatDate } from '../../lib/formatters';
import { requestPresignedDownload } from '../../services/objectService';
import type { FileObject } from '../../types';
import { FileIcon } from './FileIcon';

interface InspectorProps {
  file: FileObject;
  bucket?: string;
  onClose: () => void;
  onDownload: (key: string, name: string) => void;
  onDelete: (file: FileObject) => void;
}

function ImagePreview({ file }: { file: FileObject }) {
  const [src, setSrc] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSrc(null);
    setFailed(false);
    requestPresignedDownload(file.key)
      .then((res) => !cancelled && setSrc(res.download_url))
      .catch(() => !cancelled && setFailed(true));
    return () => {
      cancelled = true;
    };
  }, [file.key]);

  if (failed) return null;
  return (
    <div className="mb-5 flex aspect-[4/3] items-center justify-center overflow-hidden rounded-xl border border-line bg-sunken">
      {src ? (
        <img src={src} alt={file.name} onError={() => setFailed(true)} className="size-full object-contain" />
      ) : (
        <div className="size-full animate-pulse bg-sunken" />
      )}
    </div>
  );
}

function Field({ label, children, mono }: { label: string; children: React.ReactNode; mono?: boolean }) {
  return (
    <div>
      <dt className="text-xs font-medium uppercase tracking-wider text-ink-3">{label}</dt>
      <dd className={`mt-1 break-all text-sm text-ink ${mono ? 'font-mono text-xs' : ''}`}>{children}</dd>
    </div>
  );
}

export function Inspector({ file, bucket, onClose, onDownload, onDelete }: InspectorProps) {
  const [copied, setCopied] = useState(false);
  const isImage = categoryOf(file) === 'images';

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1600);
    } catch {
      setCopied(false);
    }
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-line px-5 py-3">
        <h2 className="text-sm font-semibold text-ink">Details</h2>
        <IconButton label="Close details" onClick={onClose}>
          <X className="size-4" />
        </IconButton>
      </div>

      <div className="flex-1 overflow-y-auto p-5">
        {isImage ? (
          <ImagePreview file={file} />
        ) : (
          <div className="mb-5 flex aspect-[4/3] items-center justify-center rounded-xl border border-line bg-sunken">
            <FileIcon file={file} size="lg" />
          </div>
        )}

        <p className="break-all text-base font-semibold leading-snug text-ink">{file.name}</p>
        <p className="mt-1 text-sm text-ink-3">
          {formatBytes(file.size)} · {file.content_type}
        </p>

        <div className="mt-5 flex gap-2">
          <Button variant="primary" className="flex-1" onClick={() => onDownload(file.key, file.name)}>
            <Download className="size-4" />
            Download
          </Button>
          <IconButton label="Delete file" className="border border-line-strong text-danger hover:bg-danger-soft hover:text-danger" onClick={() => onDelete(file)}>
            <Trash2 className="size-4" />
          </IconButton>
        </div>

        <dl className="mt-6 space-y-4 border-t border-line pt-5">
          <Field label="Modified">{formatDate(file.last_modified)}</Field>
          <Field label="Object key" mono>
            {file.key}
          </Field>
          {bucket && (
            <Field label="Location" mono>
              s3://{bucket}/{file.key}
            </Field>
          )}
          <Field label="ETag" mono>
            {file.etag || '—'}
          </Field>
        </dl>

        <Button variant="ghost" className="mt-5 w-full justify-start" onClick={() => copy(file.key)}>
          {copied ? <Check className="size-4 text-accent" /> : <Copy className="size-4" />}
          {copied ? 'Copied' : 'Copy object key'}
        </Button>
      </div>
    </div>
  );
}
