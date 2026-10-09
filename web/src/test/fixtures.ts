import type { FileObject, FolderObject, ObjectListResponse } from '../types';

export function makeFile(name: string, overrides: Partial<FileObject> = {}): FileObject {
  return {
    key: name,
    name,
    size: 1024,
    content_type: 'application/octet-stream',
    last_modified: '2026-01-01T12:00:00Z',
    etag: 'etag-' + name,
    ...overrides,
  };
}

export function makeFolder(name: string, parent = ''): FolderObject {
  return { name, prefix: `${parent}${name}/` };
}

export function makeListing(
  prefix: string,
  folders: FolderObject[] = [],
  objects: FileObject[] = [],
): ObjectListResponse {
  return {
    prefix,
    folders,
    objects,
    total_count: folders.length + objects.length,
    total_size: objects.reduce((sum, o) => sum + o.size, 0),
  };
}
