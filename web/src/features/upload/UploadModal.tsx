import React, { useRef, useState } from 'react';
import { Upload, X, CheckCircle2, AlertCircle, Loader2, FileUp } from 'lucide-react';
import type { UploadItem } from '../../hooks/useUpload';
import { formatBytes } from '../../lib/formatters';

interface UploadModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPrefix: string;
  queue: UploadItem[];
  isUploading: boolean;
  onStartUpload: (files: File[]) => void;
  onClearQueue: () => void;
}

export function UploadModal({
  isOpen,
  onClose,
  targetPrefix,
  queue,
  isUploading,
  onStartUpload,
  onClearQueue,
}: UploadModalProps) {
  const [selectedFiles, setSelectedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      setSelectedFiles(Array.from(e.target.files));
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      setSelectedFiles(Array.from(e.dataTransfer.files));
    }
  };

  const handleUploadClick = () => {
    if (selectedFiles.length > 0) {
      onStartUpload(selectedFiles);
    }
  };

  const handleClose = () => {
    if (isUploading) return;
    setSelectedFiles([]);
    onClearQueue();
    onClose();
  };

  const displayPrefix = targetPrefix ? targetPrefix : 'Root (/)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-xl rounded-2xl glass-panel border border-slate-800 shadow-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-indigo-600/20 text-indigo-400 border border-indigo-500/30">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Upload Files</h3>
              <p className="text-xs text-slate-400">
                Target Folder: <span className="text-indigo-400 font-mono font-medium">{displayPrefix}</span>
              </p>
            </div>
          </div>
          <button
            disabled={isUploading}
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 space-y-5 overflow-y-auto flex-1">
          {queue.length === 0 ? (
            /* Dropzone area */
            <div
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
              onClick={() => fileInputRef.current?.click()}
              className={`p-8 rounded-xl border-2 border-dashed text-center cursor-pointer transition-all flex flex-col items-center justify-center gap-3 ${
                isDragging
                  ? 'border-indigo-500 bg-indigo-500/10 scale-[0.99]'
                  : 'border-slate-700 hover:border-slate-600 bg-slate-900/40 hover:bg-slate-900/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                multiple
                onChange={handleFileSelect}
                className="hidden"
              />
              <div className="p-4 rounded-full bg-slate-800/80 border border-slate-700 text-indigo-400">
                <FileUp className="w-8 h-8" />
              </div>
              <div>
                <p className="text-sm font-semibold text-white">
                  Click to choose files or drag & drop here
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Files upload directly to object storage via temporary presigned URLs.
                </p>
              </div>

              {selectedFiles.length > 0 && (
                <div className="mt-2 text-xs font-mono px-3 py-1.5 rounded-lg bg-indigo-600/20 text-indigo-300 border border-indigo-500/30">
                  {selectedFiles.length} file(s) selected ({formatBytes(selectedFiles.reduce((acc, f) => acc + f.size, 0))})
                </div>
              )}
            </div>
          ) : (
            /* Queue & Progress Listing */
            <div className="space-y-3">
              <p className="text-xs font-semibold text-slate-400 uppercase tracking-wider">
                Upload Queue ({queue.filter((q) => q.status === 'completed').length} / {queue.length})
              </p>
              <div className="space-y-2 max-h-60 overflow-y-auto pr-1">
                {queue.map((item) => (
                  <div
                    key={item.id}
                    className="p-3 rounded-xl bg-slate-900/80 border border-slate-800 space-y-2"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex items-center gap-2 truncate min-w-0 pr-2">
                        <span className="font-medium text-slate-200 truncate">{item.file.name}</span>
                        <span className="text-slate-500 font-mono text-[11px] shrink-0">
                          ({formatBytes(item.file.size)})
                        </span>
                      </div>
                      <div className="shrink-0 font-medium">
                        {item.status === 'pending' && <span className="text-slate-500">Pending</span>}
                        {item.status === 'uploading' && (
                          <span className="text-indigo-400 flex items-center gap-1">
                            <Loader2 className="w-3 h-3 animate-spin" /> {item.progress}%
                          </span>
                        )}
                        {item.status === 'completed' && (
                          <span className="text-emerald-400 flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5" /> Done
                          </span>
                        )}
                        {item.status === 'error' && (
                          <span className="text-rose-400 flex items-center gap-1">
                            <AlertCircle className="w-3.5 h-3.5" /> Error
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Progress Bar */}
                    <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                      <div
                        className={`h-full transition-all duration-200 ${
                          item.status === 'error'
                            ? 'bg-rose-500'
                            : item.status === 'completed'
                            ? 'bg-emerald-500'
                            : 'bg-indigo-500'
                        }`}
                        style={{ width: `${item.progress}%` }}
                      />
                    </div>
                    {item.errorMsg && (
                      <p className="text-[11px] text-rose-400 font-mono truncate">{item.errorMsg}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Footer Actions */}
        <div className="p-4 border-t border-slate-800 bg-slate-900/40 flex items-center justify-end gap-3">
          <button
            disabled={isUploading}
            onClick={handleClose}
            className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
          >
            {queue.some((q) => q.status === 'completed') ? 'Close' : 'Cancel'}
          </button>
          {queue.length === 0 && (
            <button
              disabled={selectedFiles.length === 0 || isUploading}
              onClick={handleUploadClick}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <Upload className="w-4 h-4" />
              Upload {selectedFiles.length > 0 ? `(${selectedFiles.length})` : ''}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
