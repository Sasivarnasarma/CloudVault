import { describe, expect, it } from 'vitest';
import { canPreview, previewKindOf } from './previewKind';

const kind = (name: string, content_type = 'application/octet-stream') => previewKindOf({ name, content_type });

describe('previewKindOf', () => {
  it('goes by the content type first, then by the extension', () => {
    expect(kind('x', 'image/png')).toBe('image');
    expect(kind('clip.MP4')).toBe('video');
    expect(kind('song.flac')).toBe('audio');
    expect(kind('paper.pdf')).toBe('pdf');
    expect(kind('notes', 'text/plain')).toBe('text');
    expect(kind('data.json')).toBe('text');
    expect(kind('main.py')).toBe('text');
  });

  it('has no preview for what a browser cannot show', () => {
    expect(kind('backup.zip')).toBeNull();
    expect(kind('report.docx')).toBeNull();
    expect(kind('noext')).toBeNull();
    expect(canPreview({ name: 'backup.zip', content_type: 'application/zip' })).toBe(false);
    expect(canPreview({ name: 'a.txt', content_type: 'text/plain' })).toBe(true);
  });
});
