import { afterEach, describe, expect, it, vi } from 'vitest';
import { readTextHead } from './readTextHead';

function respond(chunks: string[], status = 200) {
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      chunks.forEach((c) => controller.enqueue(encoder.encode(c)));
      controller.close();
    },
  });
  vi.stubGlobal(
    'fetch',
    vi.fn(async () => new Response(body, { status })),
  );
}

afterEach(() => vi.unstubAllGlobals());

describe('readTextHead', () => {
  it('returns a short file whole', async () => {
    respond(['hello ', 'world']);
    expect(await readTextHead('https://storage.test/a', 100)).toEqual({ text: 'hello world', truncated: false });
  });

  it('stops at the limit and says the file goes on', async () => {
    respond(['abcdef', 'ghijkl']);
    expect(await readTextHead('https://storage.test/a', 8)).toEqual({ text: 'abcdefgh', truncated: true });
  });

  it('does not report a file of exactly the limit as cut', async () => {
    respond(['abcd', 'efgh']);
    expect(await readTextHead('https://storage.test/a', 8)).toEqual({ text: 'abcdefgh', truncated: false });
  });

  it('drops a character that was cut in half instead of printing a replacement mark', async () => {
    respond(['ab€cd']); // "€" is three bytes: cutting after the first leaves part of it
    const { text } = await readTextHead('https://storage.test/a', 3);
    expect(text).toBe('ab');
  });

  it('fails when storage refuses', async () => {
    respond(['denied'], 403);
    await expect(readTextHead('https://storage.test/a', 8)).rejects.toThrow('403');
  });
});
