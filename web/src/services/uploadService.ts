import type { PresignDownloadResponse, PresignUploadResponse } from '../types';

export async function requestPresignedUpload(
  key: string,
  contentType: string,
  size?: number
): Promise<PresignUploadResponse> {
  const response = await fetch('/api/objects/presign-upload', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ key, content_type: contentType, size }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to request upload URL' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

export function uploadFileDirect(
  uploadUrl: string,
  file: File,
  contentType: string,
  onProgress?: (percent: number) => void
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open('PUT', uploadUrl, true);
    xhr.setRequestHeader('Content-Type', contentType || 'application/octet-stream');

    if (xhr.upload && onProgress) {
      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable) {
          const percentComplete = Math.round((event.loaded / event.total) * 100);
          onProgress(percentComplete);
        }
      };
    }

    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve();
      } else {
        reject(new Error(`Direct storage upload failed with HTTP status ${xhr.status}`));
      }
    };

    xhr.onerror = () => {
      reject(new Error('Network error occurred during direct storage upload'));
    };

    xhr.send(file);
  });
}

export async function requestPresignedDownload(
  key: string,
  filename?: string
): Promise<PresignDownloadResponse> {
  const url = filename
    ? `/api/objects/presign-download?key=${encodeURIComponent(key)}&filename=${encodeURIComponent(filename)}`
    : `/api/objects/presign-download?key=${encodeURIComponent(key)}`;

  const response = await fetch(url);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to request download URL' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}

export function triggerBrowserDownload(downloadUrl: string): void {
  const link = document.createElement('a');
  link.href = downloadUrl;
  link.rel = 'noopener noreferrer';
  link.target = '_blank';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}
