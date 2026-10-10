import { Loader2 } from 'lucide-react';
import type { ComponentProps } from 'react';
import { cn } from '../../lib/cn';

/** A small spinning loader. Pass a size class (`size-6`) to change it from the default `size-4`. */
export function Spinner({ className, ...props }: ComponentProps<typeof Loader2>) {
  return <Loader2 className={cn('size-4 animate-spin', className)} {...props} />;
}
