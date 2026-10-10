import type { MultipartCompleteResponse, MultipartPlan, PartUrlsResponse, UploadedPartsResponse } from '../types';
import { jsonBody, request } from './http';

const BASE = '/api/uploads/multipart';

export function createMultipartUpload(
  key: string,
  size: number,
  contentType: string,
  overwrite = false,
): Promise<MultipartPlan> {
  return request(BASE, jsonBody({ key, size, content_type: contentType, overwrite }), 'Failed to start upload');
}

export function presignUploadParts(key: string, uploadId: string, partNumbers: number[]): Promise<PartUrlsResponse> {
  return request(
    `${BASE}/parts`,
    jsonBody({ key, upload_id: uploadId, part_numbers: partNumbers }),
    'Failed to request part upload URLs',
  );
}

export function listUploadedParts(key: string, uploadId: string): Promise<UploadedPartsResponse> {
  const params = new URLSearchParams({ key, upload_id: uploadId });
  return request(`${BASE}/parts?${params}`, undefined, 'Failed to list uploaded parts');
}

export function completeMultipartUpload(
  key: string,
  uploadId: string,
  partCount: number,
): Promise<MultipartCompleteResponse> {
  return request(
    `${BASE}/complete`,
    jsonBody({ key, upload_id: uploadId, part_count: partCount }),
    'Failed to finish upload',
  );
}

export function abortMultipartUpload(key: string, uploadId: string): Promise<{ success: boolean }> {
  return request(`${BASE}/abort`, jsonBody({ key, upload_id: uploadId }), 'Failed to cancel upload');
}
