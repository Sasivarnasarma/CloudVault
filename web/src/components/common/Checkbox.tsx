import { Check, Minus } from 'lucide-react';
import { cn } from '../../lib/cn';

interface CheckboxProps {
  checked: boolean;
  /** Some, but not all, of a group is checked. */
  indeterminate?: boolean;
  /** Names the box for screen readers, e.g. "Select report.pdf". */
  label: string;
  onChange: () => void;
  className?: string;
  /** False takes it out of the tab order (a list that has one tab stop per row). */
  tabbable?: boolean;
}

/** A small square checkbox button. It never passes its click on to the row or tile it sits in. */
export function Checkbox({
  checked,
  indeterminate = false,
  label,
  onChange,
  className,
  tabbable = true,
}: CheckboxProps) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      aria-label={label}
      tabIndex={tabbable ? undefined : -1}
      onClick={(e) => {
        e.stopPropagation();
        onChange();
      }}
      className={cn(
        'inline-flex size-5 shrink-0 items-center justify-center rounded-md border transition',
        checked || indeterminate
          ? 'border-accent bg-accent text-accent-ink'
          : 'border-line-strong bg-surface-2 text-transparent hover:border-accent',
        className,
      )}
    >
      {indeterminate ? <Minus className="size-3.5" strokeWidth={3} /> : <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}
