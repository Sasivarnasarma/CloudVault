export interface TextHead {
  text: string;
  /** The file is longer than what was read. */
  truncated: boolean;
}

/**
 * Read the start of a text file straight from storage. It stops downloading once `maxBytes` have
 * arrived, so previewing a huge log doesn't pull the whole file. (No Range header: that would need
 * extra CORS rules on the bucket.)
 */
export async function readTextHead(url: string, maxBytes: number, signal?: AbortSignal): Promise<TextHead> {
  const res = await fetch(url, { signal });
  if (!res.ok) throw new Error(`Storage answered ${res.status}`);

  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body?.getReader();
  if (reader) {
    while (total <= maxBytes) {
      const { done, value } = await reader.read();
      if (done) break;
      chunks.push(value);
      total += value.length;
    }
    if (total > maxBytes) void reader.cancel().catch(() => undefined);
  } else {
    const all = new Uint8Array(await res.arrayBuffer());
    chunks.push(all);
    total = all.length;
  }

  const bytes = new Uint8Array(Math.min(total, maxBytes));
  let offset = 0;
  for (const chunk of chunks) {
    if (offset >= bytes.length) break;
    const part = chunk.subarray(0, bytes.length - offset);
    bytes.set(part, offset);
    offset += part.length;
  }
  const truncated = total > maxBytes;
  // `stream` drops a character that was cut in half at the end instead of printing a replacement mark.
  return { text: new TextDecoder().decode(bytes, { stream: truncated }), truncated };
}
