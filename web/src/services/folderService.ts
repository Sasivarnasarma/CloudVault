import type { FolderObject } from '../types';

export interface CreateFolderResponse {
  success: boolean;
  folder: FolderObject;
}

export async function createFolder(path: string): Promise<CreateFolderResponse> {
  const response = await fetch('/api/folders', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to create folder' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }

  return response.json();
}
