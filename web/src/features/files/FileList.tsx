import { Folder, Trash2 } from 'lucide-react';
import type { FileObject, FolderObject } from '../../types';
import { formatBytes, formatDate } from '../../lib/formatters';
import { FileIcon } from './FileIcon';

interface FileListProps {
  folders: FolderObject[];
  objects: FileObject[];
  onFolderClick: (prefix: string) => void;
  onDeleteFile?: (key: string) => void;
  onDeleteFolder?: (prefix: string) => void;
}

export function FileList({
  folders,
  objects,
  onFolderClick,
  onDeleteFile,
  onDeleteFolder,
}: FileListProps) {
  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-800 bg-slate-900/50 backdrop-blur">
      <div className="overflow-x-auto">
        <table className="w-full text-left border-collapse text-sm">
          <thead>
            <tr className="border-b border-slate-800 bg-slate-800/40 text-slate-400 font-medium text-xs uppercase tracking-wider">
              <th className="py-3.5 px-4">Name</th>
              <th className="py-3.5 px-4 hidden sm:table-cell">Size</th>
              <th className="py-3.5 px-4 hidden md:table-cell">Last Modified</th>
              <th className="py-3.5 px-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/60">
            {/* Render Folders First */}
            {folders.map((folder) => (
              <tr
                key={folder.prefix}
                onClick={() => onFolderClick(folder.prefix)}
                className="group hover:bg-slate-800/50 cursor-pointer transition-colors"
              >
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-amber-500/10 text-amber-400 border border-amber-500/20 group-hover:bg-amber-500/20 transition-colors">
                      <Folder className="w-4 h-4 fill-amber-400/20" />
                    </div>
                    <span className="font-medium text-slate-200 group-hover:text-white transition-colors truncate max-w-60 sm:max-w-90">
                      {folder.name}
                    </span>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-400 font-mono text-xs hidden sm:table-cell">
                  —
                </td>
                <td className="py-3.5 px-4 text-slate-400 text-xs hidden md:table-cell">
                  Folder
                </td>
                <td className="py-3.5 px-4 text-right" onClick={(e) => e.stopPropagation()}>
                  {onDeleteFolder && (
                    <button
                      onClick={() => onDeleteFolder(folder.prefix)}
                      className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                      title="Delete Folder"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </td>
              </tr>
            ))}

            {/* Render Files */}
            {objects.map((file) => (
              <tr
                key={file.key}
                className="group hover:bg-slate-800/40 transition-colors"
              >
                <td className="py-3.5 px-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-slate-800 text-slate-300 border border-slate-700">
                      <FileIcon fileName={file.name} contentType={file.content_type} />
                    </div>
                    <div className="flex flex-col min-w-0">
                      <span className="font-medium text-slate-200 group-hover:text-white transition-colors truncate max-w-60 sm:max-w-90">
                        {file.name}
                      </span>
                      <span className="text-xs text-slate-500 font-mono sm:hidden">
                        {formatBytes(file.size)}
                      </span>
                    </div>
                  </div>
                </td>
                <td className="py-3.5 px-4 text-slate-300 font-mono text-xs hidden sm:table-cell">
                  {formatBytes(file.size)}
                </td>
                <td className="py-3.5 px-4 text-slate-400 text-xs hidden md:table-cell">
                  {formatDate(file.last_modified)}
                </td>
                <td className="py-3.5 px-4 text-right">
                  <div className="flex items-center justify-end gap-1">
                    {onDeleteFile && (
                      <button
                        onClick={() => onDeleteFile(file.key)}
                        className="p-1.5 text-slate-400 hover:text-red-400 hover:bg-red-500/10 rounded-lg transition-colors"
                        title="Delete File"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
