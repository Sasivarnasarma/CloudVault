import { beforeEach, describe, expect, it } from 'vitest';
import {
  forgetPendingUpload,
  isSameFile,
  loadPendingUploads,
  PENDING_MAX_AGE_MS,
  rememberPendingUpload,
  type PendingUpload,
} from './pendingUploads';

const upload = (overrides: Partial<PendingUpload> = {}): PendingUpload => ({
  key: 'docs/big.bin',
  uploadId: 'u1',
  partSize: 10,
  partCount: 3,
  contentType: 'application/octet-stream',
  fileName: 'big.bin',
  size: 30,
  lastModified: 1000,
  startedAt: 5000,
  ...overrides,
});

beforeEach(() => localStorage.clear());

describe('pending uploads', () => {
  it('remembers an upload once, however often it is saved, and forgets it', () => {
    rememberPendingUpload(upload());
    rememberPendingUpload(upload());
    rememberPendingUpload(upload({ uploadId: 'u2' }));
    expect(loadPendingUploads(5000).pending.map((p) => p.uploadId)).toEqual(['u1', 'u2']);

    forgetPendingUpload('u1');
    forgetPendingUpload('u2');
    expect(loadPendingUploads(5000).pending).toEqual([]);
    expect(localStorage.getItem('cloudvault:pending-uploads')).toBeNull();
  });

  it('separates the uploads that waited too long, and drops them from storage', () => {
    rememberPendingUpload(upload({ uploadId: 'old', startedAt: 0 }));
    rememberPendingUpload(upload({ uploadId: 'new', startedAt: PENDING_MAX_AGE_MS }));

    const { pending, expired } = loadPendingUploads(PENDING_MAX_AGE_MS + 1);
    expect(pending.map((p) => p.uploadId)).toEqual(['new']);
    expect(expired.map((p) => p.uploadId)).toEqual(['old']);
    expect(loadPendingUploads(PENDING_MAX_AGE_MS + 1).expired).toEqual([]);
  });

  it('ignores storage that is damaged or has the wrong shape', () => {
    localStorage.setItem('cloudvault:pending-uploads', '{not json');
    expect(loadPendingUploads().pending).toEqual([]);
    localStorage.setItem('cloudvault:pending-uploads', JSON.stringify([{ key: 1 }, 'x', upload()]));
    expect(loadPendingUploads(5000).pending).toHaveLength(1);
  });

  it('recognises the same file by name, size and modified time', () => {
    const file = new File(['x'.repeat(30)], 'big.bin', { lastModified: 1000 });
    expect(isSameFile(upload(), file)).toBe(true);
    expect(isSameFile(upload({ fileName: 'other.bin' }), file)).toBe(false);
    expect(isSameFile(upload({ size: 31 }), file)).toBe(false);
    expect(isSameFile(upload({ lastModified: 2000 }), file)).toBe(false);
  });
});
