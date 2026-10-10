export interface HealthResponse {
  status: string;
  app_name: string;
  version: string;
  storage_provider: string;
  bucket: string;
  storage_connected: boolean;
}

export interface FileObject {
  key: string;
  name: string;
  size: number;
  content_type: string;
  last_modified: string;
  etag: string;
}

export interface FolderObject {
  name: string;
  prefix: string;
}

export interface ObjectListResponse {
  prefix: string;
  folders: FolderObject[];
  objects: FileObject[];
  total_count: number;
  total_size: number;
  /** Present when the listing was requested one page at a time. */
  next_cursor?: string | null;
  has_more?: boolean;
}

export interface PresignUploadResponse {
  upload_url: string;
  method: string;
  headers: Record<string, string>;
  key: string;
  expires_in: number;
}

export interface PresignDownloadResponse {
  download_url: string;
  key: string;
  expires_in: number;
}

export interface DeleteObjectResponse {
  success: boolean;
  key: string;
  message: string;
}

export interface CreateFolderResponse {
  success: boolean;
  folder: FolderObject;
}

export interface DeleteFolderResponse {
  success: boolean;
  prefix: string;
  deleted_count: number;
}

export interface TransferObjectResponse {
  success: boolean;
  source: string;
  destination: string;
}

export interface TransferFolderResponse extends TransferObjectResponse {
  item_count: number;
}

export interface TreeFile {
  key: string;
  size: number;
}

/** Everything inside a folder, however deep. */
export interface FolderTreeResponse {
  prefix: string;
  files: TreeFile[];
  /** Prefixes of folders with nothing inside them. */
  empty_folders: string[];
  total_size: number;
}

export interface PresignDownloadsResponse {
  items: PresignDownloadResponse[];
  expires_in: number;
}

export interface MultipartPlan {
  key: string;
  upload_id: string;
  part_size: number;
  part_count: number;
}

export interface PartUrlsResponse {
  parts: { part_number: number; url: string }[];
  expires_in: number;
}

export interface UploadedPartsResponse {
  parts: { part_number: number; size: number; etag: string }[];
}

export interface MultipartCompleteResponse {
  success: boolean;
  key: string;
  etag?: string | null;
}

export interface TrashItemRequest {
  path: string;
  type: 'file' | 'folder';
}

/** A file or folder that was deleted, as it was. */
export interface TrashRoot extends TrashItemRequest {
  size: number;
  /** Files inside it; 1 for a file. */
  item_count: number;
}

export interface TrashFailure {
  path: string;
  error: string;
}

/** Everything deleted by one action. It is restored or removed together. */
export interface TrashBatch {
  id: string;
  deleted_at: string;
  roots: TrashRoot[];
  total_size: number;
}

export interface TrashMoveResponse {
  /** Null when nothing could be moved. */
  batch: TrashBatch | null;
  failed: TrashFailure[];
}

export interface TrashListResponse {
  batches: TrashBatch[];
  total_size: number;
}

export interface TrashRestoreResponse {
  restored: string[];
  failed: TrashFailure[];
}

export interface TrashPurgeResponse {
  deleted_count: number;
}
