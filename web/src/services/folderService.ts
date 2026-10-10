import type { CreateFolderResponse, DeleteFolderResponse, FolderTreeResponse, TransferFolderResponse } from '../types';
import { jsonBody, request } from './http';

export function createFolder(path: string): Promise<CreateFolderResponse> {
  return request('/api/folders', jsonBody({ path }), 'Failed to create folder');
}

export function deleteFolder(prefix: string): Promise<DeleteFolderResponse> {
  return request(`/api/folders?prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' }, 'Failed to delete folder');
}

export function copyFolder(source: string, destination: string): Promise<TransferFolderResponse> {
  return request('/api/folders/copy', jsonBody({ source, destination }), 'Failed to copy folder');
}

export function moveFolder(source: string, destination: string): Promise<TransferFolderResponse> {
  return request('/api/folders/move', jsonBody({ source, destination }), 'Failed to move folder');
}

/** Every file under a folder (however deep) with its size, and the folders that are empty. */
export function fetchFolderTree(prefix: string, signal?: AbortSignal): Promise<FolderTreeResponse> {
  return request(`/api/folders/tree?prefix=${encodeURIComponent(prefix)}`, { signal }, 'Failed to list the folder');
}
