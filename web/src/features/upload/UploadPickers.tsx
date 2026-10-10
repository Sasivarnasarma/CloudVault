import type { RefObject } from 'react';
import { fromDirectoryInput, type DroppedContent } from '../../lib/dropEntries';

interface UploadPickersProps {
  fileInputRef: RefObject<HTMLInputElement | null>;
  folderInputRef: RefObject<HTMLInputElement | null>;
  resumeInputRef: RefObject<HTMLInputElement | null>;
  onFiles: (files: File[]) => void;
  onFolder: (content: DroppedContent) => void;
  /** Files picked to continue unfinished uploads. */
  onResume: (files: File[]) => void;
}

/** The hidden inputs behind the "Upload", "Upload folder" and "Resume" buttons. */
export function UploadPickers({
  fileInputRef,
  folderInputRef,
  resumeInputRef,
  onFiles,
  onFolder,
  onResume,
}: UploadPickersProps) {
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
      <input
        ref={resumeInputRef}
        type="file"
        multiple
        className="hidden"
        aria-hidden="true"
        aria-label="Choose files to resume"
        tabIndex={-1}
        onChange={(e) => {
          onResume(Array.from(e.target.files ?? []));
          e.target.value = '';
        }}
      />
    </>
  );
}
