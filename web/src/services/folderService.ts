import type { CreateFolderResponse, DeleteFolderResponse } from '../types';
import { jsonBody, request } from './http';

export function createFolder(path: string): Promise<CreateFolderResponse> {
  return request('/api/folders', jsonBody({ path }), 'Failed to create folder');
}

export function deleteFolder(prefix: string): Promise<DeleteFolderResponse> {
  return request(`/api/folders?prefix=${encodeURIComponent(prefix)}`, { method: 'DELETE' }, 'Failed to delete folder');
}
