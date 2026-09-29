import type { FileObject, ObjectListResponse } from '../types';

export async function listObjects(prefix: string = ''): Promise<ObjectListResponse> {
  const url = prefix
    ? `/api/objects?prefix=${encodeURIComponent(prefix)}`
    : '/api/objects';
  const response = await fetch(url);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch objects' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function getObjectMetadata(key: string): Promise<FileObject> {
  const response = await fetch(`/api/objects/metadata?key=${encodeURIComponent(key)}`);
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to fetch object metadata' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function deleteObject(key: string): Promise<{ success: boolean; key: string; message: string }> {
  const response = await fetch(`/api/objects?key=${encodeURIComponent(key)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to delete object' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }
  return response.json();
}

export async function deleteFolder(prefix: string): Promise<{ success: boolean; prefix: string; deleted_count: number }> {
  const response = await fetch(`/api/folders?prefix=${encodeURIComponent(prefix)}`, {
    method: 'DELETE',
  });
  if (!response.ok) {
    const errorData = await response.json().catch(() => ({ detail: 'Failed to delete folder' }));
    throw new Error(errorData.detail || `HTTP error ${response.status}`);
  }
  return response.json();
}
