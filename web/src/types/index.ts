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
