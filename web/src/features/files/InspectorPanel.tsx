import { AnimatePresence, motion } from 'motion/react';
import { Inspector } from './Inspector';

const WIDTH = '22rem';

type InspectorProps = Parameters<typeof Inspector>[0];

/** Slides the file details in from the right while a file is selected. */
export function InspectorPanel({ file, ...props }: Omit<InspectorProps, 'file'> & { file: InspectorProps['file'] | null }) {
  return (
    <AnimatePresence initial={false}>
      {file && (
        <motion.aside
          key="inspector"
          aria-label="File details"
          className="fixed inset-y-0 right-0 z-30 max-w-[100vw] shrink-0 overflow-hidden border-l border-line bg-surface shadow-pop xl:static xl:z-auto xl:shadow-none"
          // Animate width (not position) so the file list reflows smoothly instead of leaving a gap.
          initial={{ width: 0, opacity: 0 }}
          animate={{ width: WIDTH, opacity: 1 }}
          exit={{ width: 0, opacity: 0 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
        >
          <div className="h-full max-w-[100vw]" style={{ width: WIDTH }}>
            <Inspector file={file} {...props} />
          </div>
        </motion.aside>
      )}
    </AnimatePresence>
  );
}
