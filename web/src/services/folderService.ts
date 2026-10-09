import type { CreateFolderResponse, DeleteFolderResponse, TransferFolderResponse } from '../types';
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
