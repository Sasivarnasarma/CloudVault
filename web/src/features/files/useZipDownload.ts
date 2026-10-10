import { makeZip } from 'client-zip';
import { useCallback, useRef, useState } from 'react';
import { toast } from 'sonner';
import { errorMessage } from '../../lib/cn';
import type { Entry } from '../../lib/entries';
import { formatBytes } from '../../lib/formatters';
import { openZipSink } from '../../lib/saveFile';
import { archiveName, planZip } from '../../lib/zipPlan';
import { fetchFolderTree } from '../../services/folderService';
import { ZipFileError, zipEntries } from './zipDownload';

/** Browsers that cannot stream to disk build the whole zip in memory, so keep that to a sane size. */
export const IN_MEMORY_LIMIT_BYTES = 1024 ** 3;
/** How often the progress message is refreshed. */
const PROGRESS_INTERVAL_MS = 250;

function isAbort(err: unknown): boolean {
  return err instanceof DOMException && err.name === 'AbortError';
}

/** The toast text for a zip that could not be made, and what to try. */
function failureMessage(err: unknown): { title: string; description?: string } {
  if (err instanceof ZipFileError) {
    return {
      title: err.message,
      description:
        err.reason === 'blocked'
          ? 'Storage could not be reached. Check the connection, and that the bucket’s CORS rule allows GET from this site.'
          : `Storage answered ${err.status}. The file may have been moved or deleted.`,
    };
  }
  return { title: 'Couldn’t make the zip', description: errorMessage(err, 'Something went wrong') };
}

/**
 * Download folders or a selection as one zip file.
 *
 * The browser does the work: the API only lists the folders and signs the file links, then the files
 * are fetched straight from storage and written into the zip as they arrive, so the data never passes
 * through the API.
 */
export function useZipDownload() {
  const [zipping, setZipping] = useState(false);
  const running = useRef(false);

  const download = useCallback(async (entries: Entry[]) => {
    if (entries.length === 0) return;
    if (running.current) {
      toast.info('A zip is already being made. Wait for it to finish or cancel it first.');
      return;
    }
    running.current = true;
    setZipping(true);

    const controller = new AbortController();
    const filename = archiveName(entries);
    let toastId: string | number | undefined;
    const show = (message: string) => {
      toastId = toast.loading(message, {
        id: toastId,
        duration: Infinity,
        action: { label: 'Cancel', onClick: () => controller.abort(new DOMException('Cancelled', 'AbortError')) },
      });
    };

    try {
      // First of all, while the click still counts: ask where to save the file.
      const sink = await openZipSink(filename);
      if (!sink) return;
      show('Preparing the zip…');

      const folders = entries.filter((e) => e.type === 'folder');
      const trees = new Map(
        await Promise.all(
          folders.map(
            async (e) => [e.folder.prefix, await fetchFolderTree(e.folder.prefix, controller.signal)] as const,
          ),
        ),
      );
      const plan = planZip(entries, trees);
      if (!sink.streaming && plan.totalSize > IN_MEMORY_LIMIT_BYTES) {
        throw new Error(
          `This browser can only make zips up to ${formatBytes(IN_MEMORY_LIMIT_BYTES)}. Use Chrome or Edge for bigger ones.`,
        );
      }

      let files = 0;
      let bytes = 0;
      let lastShown = 0;
      const progress = () => {
        const now = Date.now();
        if (now - lastShown < PROGRESS_INTERVAL_MS) return;
        lastShown = now;
        show(
          `Zipping ${files} of ${plan.files.length} files · ${formatBytes(bytes)} of ${formatBytes(plan.totalSize)}`,
        );
      };
      const stream = makeZip(
        zipEntries(plan, controller.signal, {
          onBytes: (count) => {
            bytes += count;
            progress();
          },
          onFile: () => {
            files += 1;
            progress();
          },
        }),
      );
      await sink.write(stream);

      toast.success(`Saved ${filename}`, {
        id: toastId,
        duration: 5000,
        description: `${plan.files.length} file${plan.files.length === 1 ? '' : 's'} · ${formatBytes(plan.totalSize)}`,
        action: undefined,
      });
    } catch (err) {
      if (isAbort(err) || controller.signal.aborted) {
        toast.dismiss(toastId);
        toast.info('Zip cancelled');
      } else {
        const { title, description } = failureMessage(err);
        toast.error(title, { id: toastId, description, duration: 8000, action: undefined });
      }
    } finally {
      running.current = false;
      setZipping(false);
    }
  }, []);

  return { download, zipping };
}
