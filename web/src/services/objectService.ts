import type {
  DeleteObjectResponse,
  FileObject,
  ObjectListResponse,
  PresignDownloadResponse,
  PresignUploadResponse,
  TransferObjectResponse,
} from '../types';
import { jsonBody, request } from './http';

export interface ListOptions {
  /** Page size. Omit to load the whole folder in one request. */
  limit?: number;
  /** `next_cursor` of the previous page. */
  cursor?: string;
}

export function listObjects(prefix = '', { limit, cursor }: ListOptions = {}): Promise<ObjectListResponse> {
  const params: string[] = [];
  if (prefix) params.push(`prefix=${encodeURIComponent(prefix)}`);
  if (limit) params.push(`limit=${limit}`);
  if (cursor) params.push(`cursor=${encodeURIComponent(cursor)}`);
  const query = params.length > 0 ? `?${params.join('&')}` : '';
  return request(`/api/objects${query}`, undefined, 'Failed to fetch objects');
}

export function getObjectMetadata(key: string): Promise<FileObject> {
  return request(`/api/objects/metadata?key=${encodeURIComponent(key)}`, undefined, 'Failed to fetch object metadata');
}

export function deleteObject(key: string): Promise<DeleteObjectResponse> {
  return request(`/api/objects?key=${encodeURIComponent(key)}`, { method: 'DELETE' }, 'Failed to delete object');
}

export function requestPresignedUpload(
  key: string,
  contentType: string,
  size?: number,
  overwrite = false,
): Promise<PresignUploadResponse> {
  return request(
    '/api/objects/presign-upload',
    jsonBody({ key, content_type: contentType, size, overwrite }),
    'Failed to request upload URL',
  );
}

export function copyObject(source: string, destination: string, overwrite = false): Promise<TransferObjectResponse> {
  return request('/api/objects/copy', jsonBody({ source, destination, overwrite }), 'Failed to copy file');
}

export function moveObject(source: string, destination: string, overwrite = false): Promise<TransferObjectResponse> {
  return request('/api/objects/move', jsonBody({ source, destination, overwrite }), 'Failed to move file');
}

export function requestPresignedDownload(key: string, filename?: string): Promise<PresignDownloadResponse> {
  const params = new URLSearchParams({ key });
  if (filename) params.set('filename', filename);
  return request(`/api/objects/presign-download?${params}`, undefined, 'Failed to request download URL');
}
