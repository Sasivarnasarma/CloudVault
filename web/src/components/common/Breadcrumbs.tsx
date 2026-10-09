import { ChevronRight } from 'lucide-react';
import { cn } from '../../lib/cn';

interface BreadcrumbsProps {
  currentPrefix: string;
  rootLabel: string;
  onNavigate: (prefix: string) => void;
}

export function Breadcrumbs({ currentPrefix, rootLabel, onNavigate }: BreadcrumbsProps) {
  const parts = currentPrefix ? currentPrefix.replace(/\/+$/, '').split('/') : [];
  const crumbs = [
    { label: rootLabel, prefix: '' },
    ...parts.map((part, i) => ({ label: part, prefix: parts.slice(0, i + 1).join('/') + '/' })),
  ];

  return (
    <nav aria-label="Folder path" className="min-w-0 flex-1">
      <ol className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap [scrollbar-width:none]">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.prefix} className="flex shrink-0 items-center gap-0.5">
              {i > 0 && <ChevronRight className="size-3.5 text-ink-3" aria-hidden="true" />}
              <button
                type="button"
                onClick={() => onNavigate(crumb.prefix)}
                aria-current={isLast ? 'page' : undefined}
                className={cn(
                  'max-w-48 truncate rounded-md px-2 py-1 text-sm transition',
                  isLast ? 'font-semibold text-ink' : 'text-ink-3 hover:bg-sunken hover:text-ink',
                )}
              >
                {crumb.label}
              </button>
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
