import type {
  TrashItemRequest,
  TrashListResponse,
  TrashMoveResponse,
  TrashPurgeResponse,
  TrashRestoreResponse,
} from '../types';
import { jsonBody, request } from './http';

/** Move files and folders to the trash. Each one succeeds or fails on its own. */
export function moveToTrash(items: TrashItemRequest[]): Promise<TrashMoveResponse> {
  return request('/api/trash', jsonBody({ items }), 'Failed to move to the trash');
}

export function listTrash(signal?: AbortSignal): Promise<TrashListResponse> {
  return request('/api/trash', { signal }, 'Failed to load the trash');
}

/** Put a deleted batch back where it was. */
export function restoreFromTrash(batchId: string): Promise<TrashRestoreResponse> {
  return request(`/api/trash/${batchId}/restore`, { method: 'POST' }, 'Failed to restore from the trash');
}

/** Delete one batch from the trash for good. */
export function deleteFromTrash(batchId: string): Promise<TrashPurgeResponse> {
  return request(`/api/trash/${batchId}`, { method: 'DELETE' }, 'Failed to delete from the trash');
}

/** Delete everything in the trash for good. */
export function emptyTrash(): Promise<TrashPurgeResponse> {
  return request('/api/trash', { method: 'DELETE' }, 'Failed to empty the trash');
}
