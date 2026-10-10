import type { ComponentType, ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface StateMessageProps {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  title: string;
  description: ReactNode;
  /** `danger` is for errors. */
  tone?: 'neutral' | 'danger';
  /** Optional action under the text, e.g. a "Try again" button. */
  children?: ReactNode;
}

/** A centered icon, title and explanation: used for empty and error states that fill a whole area. */
export function StateMessage({ icon: Icon, title, description, tone = 'neutral', children }: StateMessageProps) {
  const danger = tone === 'danger';
  return (
    <div className="flex h-full min-h-72 flex-col items-center justify-center px-6 text-center">
      <div
        className={cn(
          'mb-5 flex items-center justify-center',
          danger
            ? 'size-14 rounded-2xl bg-danger-soft text-danger'
            : 'size-20 rounded-3xl border border-dashed border-line-strong bg-surface text-ink-3',
        )}
      >
        <Icon className={danger ? 'size-7' : 'size-9'} strokeWidth={danger ? 2 : 1.5} />
      </div>
      <h2 className="text-base font-semibold text-ink">{title}</h2>
      <p className="mt-1.5 max-w-sm text-sm text-ink-3">{description}</p>
      {children}
    </div>
  );
}
