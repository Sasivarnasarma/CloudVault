import { toast } from 'sonner';
import { errorMessage } from '../../lib/cn';
import { requestPresignedDownload } from '../../services/objectService';
import { triggerBrowserDownload } from '../../services/transferService';

/** Ask the API for a download link and let the browser fetch the file straight from storage. */
export async function downloadFile(key: string, name: string): Promise<void> {
  try {
    const res = await requestPresignedDownload(key, name);
    triggerBrowserDownload(res.download_url);
    toast.success(`Downloading ${name}`);
  } catch (err) {
    toast.error(errorMessage(err, `Couldn’t download ${name}`));
  }
}
