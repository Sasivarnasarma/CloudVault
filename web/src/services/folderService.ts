import type { CreateFolderResponse, DeleteFolderResponse, FolderTreeResponse, TransferFolderResponse } from '../types';
import { jsonBody, request, requestWithProgress, type Progress } from './http';

export function createFolder(path: string): Promise<CreateFolderResponse> {
  return request('/api/folders', jsonBody({ path }), 'Failed to create folder');
}

export function deleteFolder(prefix: string): Promise<DeleteFolderResponse> {
  return request(`/api/folders?prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' }, 'Failed to delete folder');
}

export interface FolderTransferOptions {
  /** Called as files are copied: how many of how many. */
  onProgress?: (progress: Progress) => void;
  /** Stops the transfer; what was copied so far is removed again. */
  signal?: AbortSignal;
}

function transferFolder(
  action: 'copy' | 'move',
  source: string,
  destination: string,
  { onProgress, signal }: FolderTransferOptions,
  failure: string,
): Promise<TransferFolderResponse> {
  const url = `/api/folders/${action}`;
  const init = jsonBody({ source, destination });
  if (!onProgress && !signal) return request(url, init, failure);
  return requestWithProgress(url, init, onProgress ?? (() => undefined), failure, signal);
}

export function copyFolder(
  source: string,
  destination: string,
  options: FolderTransferOptions = {},
): Promise<TransferFolderResponse> {
  return transferFolder('copy', source, destination, options, 'Failed to copy folder');
}

export function moveFolder(
  source: string,
  destination: string,
  options: FolderTransferOptions = {},
): Promise<TransferFolderResponse> {
  return transferFolder('move', source, destination, options, 'Failed to move folder');
}

/** Every file under a folder (however deep) with its size, and the folders that are empty. */
export function fetchFolderTree(prefix: string, signal?: AbortSignal): Promise<FolderTreeResponse> {
  return request(`/api/folders/tree?prefix=${encodeURIComponent(prefix)}`, { signal }, 'Failed to list the folder');
}
