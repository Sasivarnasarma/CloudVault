import * as ContextMenu from '@radix-ui/react-context-menu';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { MoreHorizontal } from 'lucide-react';
import type { ComponentType, ReactNode } from 'react';
import { cn } from '../../lib/cn';

export interface MenuItem {
  label: string;
  icon: ComponentType<{ className?: string }>;
  onSelect: () => void;
  danger?: boolean;
  separatorBefore?: boolean;
}

const contentClass =
  'z-50 min-w-48 rounded-xl border border-line bg-surface-2 p-1.5 shadow-pop outline-none ' +
  'data-[state=open]:animate-in';

const itemClass = (danger?: boolean) =>
  cn(
    'flex cursor-pointer select-none items-center gap-2.5 rounded-lg px-2.5 py-2 text-sm outline-none',
    'data-[highlighted]:bg-sunken',
    danger ? 'text-danger data-[highlighted]:bg-danger-soft' : 'text-ink',
  );

const separatorClass = 'my-1 h-px bg-line';

export function EntryContextMenu({ items, children }: { items: MenuItem[]; children: ReactNode }) {
  return (
    <ContextMenu.Root>
      <ContextMenu.Trigger asChild>{children}</ContextMenu.Trigger>
      <ContextMenu.Portal>
        <ContextMenu.Content className={contentClass}>
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <ContextMenu.Separator className={separatorClass} />}
              <ContextMenu.Item className={itemClass(item.danger)} onSelect={item.onSelect}>
                <item.icon className="size-4 text-current opacity-70" />
                {item.label}
              </ContextMenu.Item>
            </div>
          ))}
        </ContextMenu.Content>
      </ContextMenu.Portal>
    </ContextMenu.Root>
  );
}

export function EntryMoreMenu({
  items,
  label,
  tabbable = true,
}: {
  items: MenuItem[];
  label: string;
  tabbable?: boolean;
}) {
  return (
    <DropdownMenu.Root>
      <DropdownMenu.Trigger asChild>
        <button
          type="button"
          aria-label={`More actions for ${label}`}
          tabIndex={tabbable ? undefined : -1}
          onClick={(e) => e.stopPropagation()}
          className="inline-flex size-8 items-center justify-center rounded-lg text-ink-3 transition hover:bg-sunken hover:text-ink data-[state=open]:bg-sunken data-[state=open]:text-ink"
        >
          <MoreHorizontal className="size-4" />
        </button>
      </DropdownMenu.Trigger>
      <DropdownMenu.Portal>
        <DropdownMenu.Content align="end" sideOffset={6} className={contentClass}>
          {items.map((item) => (
            <div key={item.label}>
              {item.separatorBefore && <DropdownMenu.Separator className={separatorClass} />}
              <DropdownMenu.Item className={itemClass(item.danger)} onSelect={item.onSelect}>
                <item.icon className="size-4 text-current opacity-70" />
                {item.label}
              </DropdownMenu.Item>
            </div>
          ))}
        </DropdownMenu.Content>
      </DropdownMenu.Portal>
    </DropdownMenu.Root>
  );
}
