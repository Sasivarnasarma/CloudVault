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
}
