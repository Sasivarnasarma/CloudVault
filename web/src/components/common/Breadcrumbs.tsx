import { ChevronRight } from 'lucide-react';
import { useDropTarget } from '../../hooks/useDropTarget';
import { cn } from '../../lib/cn';

interface BreadcrumbsProps {
  currentPrefix: string;
  rootLabel: string;
  onNavigate: (prefix: string) => void;
  /** True while entries are being dragged, which turns the parent folders into drop targets. */
  dragActive?: boolean;
  /** Entries were dropped on one of the folders in the path. */
  onDropToPrefix?: (prefix: string) => void;
}

interface CrumbProps {
  label: string;
  prefix: string;
  current: boolean;
  dropEnabled: boolean;
  onNavigate: (prefix: string) => void;
  onDropToPrefix?: (prefix: string) => void;
}

function Crumb({ label, prefix, current, dropEnabled, onNavigate, onDropToPrefix }: CrumbProps) {
  const drop = useDropTarget({ enabled: dropEnabled, onDrop: () => onDropToPrefix?.(prefix) });
  return (
    <button
      type="button"
      onClick={() => onNavigate(prefix)}
      aria-current={current ? 'page' : undefined}
      {...drop.handlers}
      {...(dropEnabled ? { 'data-drop-prefix': prefix } : {})}
      className={cn(
        'max-w-48 truncate rounded-md px-2 py-1 text-sm transition',
        'data-[touch-over]:bg-accent-soft data-[touch-over]:text-accent data-[touch-over]:ring-2 data-[touch-over]:ring-accent',
        current ? 'font-semibold text-ink' : 'text-ink-3 hover:bg-sunken hover:text-ink',
        drop.over && 'bg-accent-soft text-accent ring-2 ring-accent',
      )}
    >
      {label}
    </button>
  );
}

export function Breadcrumbs({
  currentPrefix,
  rootLabel,
  onNavigate,
  dragActive = false,
  onDropToPrefix,
}: BreadcrumbsProps) {
  const parts = currentPrefix ? currentPrefix.replace(/\/+$/, '').split('/') : [];
  const crumbs = [
    { label: rootLabel, prefix: '' },
    ...parts.map((part, i) => ({ label: part, prefix: parts.slice(0, i + 1).join('/') + '/' })),
  ];

  return (
    <nav aria-label="Folder path" className="min-w-0 flex-1">
      <ol className="flex items-center gap-0.5 overflow-x-auto whitespace-nowrap scrollbar-none">
        {crumbs.map((crumb, i) => {
          const isLast = i === crumbs.length - 1;
          return (
            <li key={crumb.prefix} className="flex shrink-0 items-center gap-0.5">
              {i > 0 && <ChevronRight className="size-3.5 text-ink-3" aria-hidden="true" />}
              <Crumb
                label={crumb.label}
                prefix={crumb.prefix}
                current={isLast}
                // Dropping on the folder you are already in would change nothing.
                dropEnabled={dragActive && !isLast && !!onDropToPrefix}
                onNavigate={onNavigate}
                onDropToPrefix={onDropToPrefix}
              />
            </li>
          );
        })}
      </ol>
    </nav>
  );
}
