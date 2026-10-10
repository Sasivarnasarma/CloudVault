import type { RefObject } from 'react';
import { fromDirectoryInput, type DroppedContent } from '../../lib/dropEntries';

interface UploadPickersProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
  onFolder: (content: DroppedContent) => void;
}

/** The hidden inputs behind the "Upload" and "Upload folder" buttons. */
export function UploadPickers({ fileInputRef, folderInputRef, onFiles, onFolder }: UploadPickersProps) {
  return (
    <>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        tabIndex={-1}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
      <input
        ref={folderInputRef}
        type="file"
        multiple
        {...({ webkitdirectory: '' } as object)}
        className="hidden"
        aria-hidden="true"
        aria-label="Upload folder"
        tabIndex={-1}
        onChange={(e) => {
          onFolder(fromDirectoryInput(Array.from(e.target.files ?? [])));
          e.target.value = '';
        }}
      />
    </>
  );
}
