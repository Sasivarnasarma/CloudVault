import { CloudUpload } from 'lucide-react';
import { AnimatePresence, motion } from 'motion/react';

/** Covers the window while files are dragged over it, saying where they will go. */
export function DropOverlay({ visible, destination }: { visible: boolean; destination: string }) {
  return (
    <AnimatePresence>
      {visible && (
        <motion.div
          className="pointer-events-none fixed inset-0 z-60 flex items-center justify-center bg-accent/10 p-6 backdrop-blur-[2px]"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div className="flex h-full w-full flex-col items-center justify-center rounded-3xl border-2 border-dashed border-accent bg-surface/80">
            <CloudUpload className="mb-3 size-12 text-accent" strokeWidth={1.5} />
            <p className="text-lg font-semibold">Drop to upload</p>
            <p className="mt-1 text-sm text-ink-3">Files go to {destination}</p>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
