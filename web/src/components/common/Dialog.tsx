import * as RadixDialog from '@radix-ui/react-dialog';
import { X } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

interface DialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

export function Dialog({ open, onOpenChange, title, description, children, className }: DialogProps) {
  return (
    <RadixDialog.Root open={open} onOpenChange={onOpenChange}>
      <AnimatePresence>
        {open && (
          <RadixDialog.Portal forceMount>
            <RadixDialog.Overlay asChild>
              <motion.div
                className="fixed inset-0 z-50 bg-ink/40 backdrop-blur-[3px]"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
              />
            </RadixDialog.Overlay>
            <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center p-4">
              <RadixDialog.Content asChild>
                <motion.div
                  className={cn(
                    'pointer-events-auto w-full max-w-md rounded-2xl border border-line bg-surface-2 p-6 shadow-pop outline-none',
                    className,
                  )}
                  initial={{ opacity: 0, y: 12, scale: 0.97 }}
                  animate={{ opacity: 1, y: 0, scale: 1 }}
                  exit={{ opacity: 0, y: 8, scale: 0.98 }}
                  transition={{ type: 'spring', stiffness: 420, damping: 34 }}
                >
                  <div className="mb-5 flex items-start justify-between gap-4">
                    <div>
                      <RadixDialog.Title className="text-lg font-semibold tracking-tight text-ink">
                        {title}
                      </RadixDialog.Title>
                      {description ? (
                        <RadixDialog.Description className="mt-1 text-sm text-ink-3">
                          {description}
                        </RadixDialog.Description>
                      ) : (
                        <RadixDialog.Description className="sr-only">{title}</RadixDialog.Description>
                      )}
                    </div>
                    <RadixDialog.Close
                      aria-label="Close"
                      className="-mr-1.5 -mt-1.5 inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-sunken hover:text-ink"
                    >
                      <X className="size-4" />
                    </RadixDialog.Close>
                  </div>
                  {children}
                </motion.div>
              </RadixDialog.Content>
            </div>
          </RadixDialog.Portal>
        )}
      </AnimatePresence>
    </RadixDialog.Root>
  );
}
