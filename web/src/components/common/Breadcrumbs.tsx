import { ChevronRight, Home } from 'lucide-react';

interface BreadcrumbsProps {
  currentPrefix: string;
  onNavigate: (prefix: string) => void;
}

export function Breadcrumbs({ currentPrefix, onNavigate }: BreadcrumbsProps) {
  const parts = currentPrefix ? currentPrefix.replace(/\/+$/, '').split('/') : [];

  const getPrefixForIndex = (index: number): string => {
    return parts.slice(0, index + 1).join('/') + '/';
  };

  return (
    <nav className="flex items-center gap-1.5 text-sm font-medium text-slate-400 overflow-x-auto py-1 scrollbar-none">
      <button
        onClick={() => onNavigate('')}
        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-lg transition-colors ${
          !currentPrefix
            ? 'text-white bg-slate-800 font-semibold'
            : 'hover:text-white hover:bg-slate-800/60'
        }`}
      >
        <Home className="w-4 h-4 text-indigo-400" />
        <span>Root</span>
      </button>

      {parts.map((part, index) => {
        const isLast = index === parts.length - 1;
        const targetPrefix = getPrefixForIndex(index);

        return (
          <div key={targetPrefix} className="flex items-center gap-1.5 shrink-0">
            <ChevronRight className="w-4 h-4 text-slate-600 shrink-0" />
            <button
              onClick={() => onNavigate(targetPrefix)}
              className={`px-2.5 py-1 rounded-lg transition-colors truncate max-w-40 ${
                isLast
                  ? 'text-white bg-slate-800 font-semibold border border-slate-700'
                  : 'hover:text-white hover:bg-slate-800/60'
              }`}
            >
              {part}
            </button>
          </div>
        );
      })}
    </nav>
  );
}
