import { useState } from 'react';
import { X, Copy, Download, Check, Calendar, HardDrive, FileText, Tag } from 'lucide-react';
import type { FileObject } from '../../types';
import { formatBytes, formatDate } from '../../lib/formatters';
import { FileIcon } from './FileIcon';

interface FileDetailsModalProps {
  file: FileObject | null;
  isOpen: boolean;
  onClose: () => void;
  onDownload: (key: string, name: string) => void;
  bucketName?: string;
}

export function FileDetailsModal({
  file,
  isOpen,
  onClose,
  onDownload,
  bucketName = 'cloudvault',
}: FileDetailsModalProps) {
  const [copied, setCopied] = useState<boolean>(false);

  if (!isOpen || !file) return null;

  const handleCopyKey = () => {
    navigator.clipboard.writeText(file.key);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const s3Uri = `s3://${bucketName}/${file.key}`;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-lg rounded-2xl glass-panel border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0 pr-2">
            <div className="p-2.5 rounded-xl bg-slate-800 text-slate-300 border border-slate-700 shrink-0">
              <FileIcon fileName={file.name} contentType={file.content_type} className="w-6 h-6" />
            </div>
            <div className="min-w-0">
              <h3 className="text-base font-bold text-white truncate">{file.name}</h3>
              <p className="text-xs text-slate-400 font-mono truncate">{file.content_type}</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body / Metadata Listing */}
        <div className="p-6 space-y-4 text-xs">
          <div className="p-3.5 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2">
            <div className="flex items-center justify-between text-slate-400 font-medium">
              <span className="flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-indigo-400" /> Object Key
              </span>
              <button
                onClick={handleCopyKey}
                className="flex items-center gap-1 text-indigo-400 hover:text-indigo-300 transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                {copied ? 'Copied' : 'Copy'}
              </button>
            </div>
            <p className="font-mono text-slate-200 break-all">{file.key}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400" /> File Size
              </span>
              <p className="font-semibold text-slate-200 font-mono text-sm">{formatBytes(file.size)}</p>
            </div>

            <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
              <span className="text-slate-500 font-medium flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-amber-400" /> Last Modified
              </span>
              <p className="font-semibold text-slate-200 text-xs">{formatDate(file.last_modified)}</p>
            </div>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-slate-500 font-medium flex items-center gap-1.5">
              <FileText className="w-3.5 h-3.5 text-cyan-400" /> ETag Header
            </span>
            <p className="font-mono text-slate-300 text-[11px] truncate">{file.etag || '—'}</p>
          </div>

          <div className="p-3 rounded-xl bg-slate-900/60 border border-slate-800 space-y-1">
            <span className="text-slate-500 font-medium">S3 URI</span>
            <p className="font-mono text-slate-400 text-[11px] truncate">{s3Uri}</p>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-end gap-3">
          <button
            onClick={onClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            Close
          </button>
          <button
            onClick={() => {
              onDownload(file.key, file.name);
              onClose();
            }}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition-colors"
          >
            <Download className="w-4 h-4" />
            Download Object
          </button>
        </div>
      </div>
    </div>
  );
}
