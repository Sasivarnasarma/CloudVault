import { ArrowDown, ArrowUp } from 'lucide-react';
import { cn } from '../../lib/cn';
import type { SortKey } from '../../lib/entries';
import type { SortState } from './browserTypes';

interface SortHeaderProps {
  label: string;
  sortKey: SortKey;
  sort: SortState;
  onSortChange: (key: SortKey) => void;
  className?: string;
}

/** A column heading of the list view that sorts by its column when clicked. */
export function SortHeader({ label, sortKey, sort, onSortChange, className }: SortHeaderProps) {
  const active = sort.key === sortKey;
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown;
  return (
    <th
      scope="col"
      aria-sort={active ? (sort.dir === 'asc' ? 'ascending' : 'descending') : 'none'}
      className={cn('px-4 py-2.5 font-medium', className)}
    >
      <button
        type="button"
        onClick={() => onSortChange(sortKey)}
        className={cn('inline-flex items-center gap-1 transition hover:text-ink', active && 'text-ink')}
      >
        {label}
        {active && <Arrow className="size-3" />}
      </button>
    </th>
  );
}
