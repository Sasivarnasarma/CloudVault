import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import { chordKeys } from '../../lib/keymap';

type KbdVariant = 'hint' | 'key' | 'on-accent';

const VARIANTS: Record<KbdVariant, string> = {
  /** A quiet hint inside a field, like the "/" in the search box. */
  hint: 'rounded border border-line bg-canvas px-1.5 text-ink-3',
  /** A key cap in the shortcuts list. */
  key: 'min-w-6 rounded-md border border-line-strong bg-surface px-1.5 py-0.5 text-center text-ink-2 shadow-card',
  /** A shortcut shown on a filled accent button. */
  'on-accent': 'rounded border border-white/30 px-1',
};

export function Kbd({
  variant = 'key',
  className,
  children,
}: {
  variant?: KbdVariant;
  className?: string;
  children: ReactNode;
}) {
  return <kbd className={cn('font-mono text-[11px]', VARIANTS[variant], className)}>{children}</kbd>;
}

/** A shortcut such as "mod+shift+u" as separate key caps: Ctrl Shift U (⌘ ⇧ U on a Mac). */
export function KeyCombo({ chord, variant, className }: { chord: string; variant?: KbdVariant; className?: string }) {
  return (
    <span className={cn('inline-flex items-center gap-0.5', className)}>
      {chordKeys(chord).map((key, i) => (
        <Kbd key={i} variant={variant}>
          {key}
        </Kbd>
      ))}
    </span>
  );
}
