import React, { useState } from 'react';
import { FolderPlus, X, Loader2 } from 'lucide-react';
import { createFolder } from '../../services/folderService';

interface CreateFolderModalProps {
  isOpen: boolean;
  onClose: () => void;
  targetPrefix: string;
  onFolderCreated: () => void;
}

export function CreateFolderModal({
  isOpen,
  onClose,
  targetPrefix,
  onFolderCreated,
}: CreateFolderModalProps) {
  const [folderName, setFolderName] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(false);
  const [error, setError] = useState<string | null>(null);

  if (!isOpen) return null;

  const validateFolderName = (name: string): string | null => {
    const trimmed = name.trim();
    if (!trimmed) return 'Folder name cannot be empty';
    if (/[/\\:*?"<>|]/.test(trimmed)) {
      return 'Folder name cannot contain slashes or special characters (/ \\ : * ? " < > |)';
    }
    if (trimmed === '..') {
      return 'Folder name cannot be ".."';
    }
    return null;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const validationError = validateFolderName(folderName);
    if (validationError) {
      setError(validationError);
      return;
    }

    const cleanPrefix = targetPrefix ? targetPrefix.replace(/\/+$/, '') + '/' : '';
    const fullPath = `${cleanPrefix}${folderName.trim()}`;

    setLoading(true);
    setError(null);

    try {
      await createFolder(fullPath);
      setFolderName('');
      onFolderCreated();
      onClose();
    } catch (err: any) {
      setError(err.message || 'Failed to create folder');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (loading) return;
    setFolderName('');
    setError(null);
    onClose();
  };

  const displayPrefix = targetPrefix ? targetPrefix : 'Root (/)';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm animate-fadeIn">
      <div className="w-full max-w-md rounded-2xl glass-panel border border-slate-800 shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="p-5 border-b border-slate-800 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-500/10 text-amber-400 border border-amber-500/20">
              <FolderPlus className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white">Create New Folder</h3>
              <p className="text-xs text-slate-400">
                Inside: <span className="text-indigo-400 font-mono font-medium">{displayPrefix}</span>
              </p>
            </div>
          </div>
          <button
            disabled={loading}
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="block text-xs font-semibold text-slate-400 uppercase tracking-wider mb-2">
              Folder Name
            </label>
            <input
              type="text"
              autoFocus
              value={folderName}
              onChange={(e) => {
                setFolderName(e.target.value);
                if (error) setError(null);
              }}
              placeholder="e.g. project-documents"
              className="w-full px-4 py-2.5 rounded-xl bg-slate-900 border border-slate-700 text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 text-sm transition-all"
            />
            {error && (
              <p className="text-xs text-rose-400 mt-2 font-medium">{error}</p>
            )}
          </div>

          {/* Footer Actions */}
          <div className="pt-3 flex items-center justify-end gap-3 border-t border-slate-800/60">
            <button
              type="button"
              disabled={loading}
              onClick={handleClose}
              className="px-4 py-2 text-xs font-medium text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading || !folderName.trim()}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white font-medium rounded-lg text-xs transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {loading ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Folder'
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
