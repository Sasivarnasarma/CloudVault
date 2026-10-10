import { Fragment } from 'react';
import { Dialog } from '../../components/common/Dialog';
import { KeyCombo } from '../../components/common/Kbd';
import { SHORTCUTS, type Shortcut, type ShortcutGroup } from '../../lib/keymap';

const GROUPS: ShortcutGroup[] = ['Move around', 'Select', 'Work with items', 'Upload and view'];

function Keys({ shortcut }: { shortcut: Shortcut }) {
  if (shortcut.chords.length === 0) return <span className="text-xs text-ink-3">{shortcut.text}</span>;
  return (
    <span className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
      {shortcut.chords.map((chord, i) => (
        <Fragment key={chord}>
          {i > 0 && <span className="text-xs text-ink-3">or</span>}
          <KeyCombo chord={chord} />
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Dialog
      open={open}
      onOpenChange={(next) => !next && onClose()}
      title="Keyboard shortcuts"
      description="They work like a desktop file manager and are off while you type in a field."
      className="max-w-3xl"
    >
      <div className="grid max-h-[60vh] gap-x-8 gap-y-5 overflow-y-auto pr-1 sm:grid-cols-2">
        {GROUPS.map((group) => (
          <section key={group} aria-label={group}>
            <h3 className="mb-2 text-xs font-medium uppercase tracking-wider text-ink-3">{group}</h3>
            <ul className="space-y-2">
              {SHORTCUTS.filter((s) => s.group === group).map((shortcut) => (
                <li key={shortcut.label} className="flex items-start justify-between gap-3 text-sm">
                  <span className="text-ink">{shortcut.label}</span>
                  <Keys shortcut={shortcut} />
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Dialog>
  );
}
