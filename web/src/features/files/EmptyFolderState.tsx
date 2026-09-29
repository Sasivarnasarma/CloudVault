import { FolderOpen } from 'lucide-react';

interface EmptyFolderStateProps {
  currentPrefix: string;
}

export function EmptyFolderState({ currentPrefix }: EmptyFolderStateProps) {
  return (
    <div className="flex flex-col items-center justify-center p-12 text-center my-6">
      <div className="p-4 rounded-full bg-slate-800/80 border border-slate-700 text-slate-400 mb-4 shadow-inner">
        <FolderOpen className="w-10 h-10 text-indigo-400" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-1">
        This folder is empty
      </h3>
      <p className="text-slate-400 text-sm max-w-sm mb-6">
        {currentPrefix
          ? `No objects found inside '${currentPrefix}'. Upload files or create a new subfolder.`
          : 'Your storage bucket root has no files yet. Upload a file or create a folder to get started.'}
      </p>
    </div>
  );
}
