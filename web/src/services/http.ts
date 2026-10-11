/** Optional API origin for deployments where the API is not served under the same origin. */
const API_BASE = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/+$/, '');

export class ApiError extends Error {
  readonly status: number;

  constructor(message: string, status: number) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
  }
}

/** Thin fetch wrapper that turns FastAPI error payloads into readable ApiErrors. */
export async function request<T>(url: string, init?: RequestInit, fallbackMessage = 'Request failed'): Promise<T> {
  const response = await fetch(`${API_BASE}${url}`, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : null;
    throw new ApiError(detail ?? fallbackMessage, response.status);
  }
  return response.json() as Promise<T>;
}

export interface Progress {
  done: number;
  total: number;
}

type StreamEvent<T> =
  ({ type: 'progress' } & Progress) | { type: 'done'; result: T } | { type: 'error'; status: number; detail: string };

/**
 * A request for a long operation that reports how far it is (`application/x-ndjson`: one JSON event per
 * line). Aborting `signal` stops the operation on the server too, which undoes what it had done.
 */
export async function requestWithProgress<T>(
  url: string,
  init: RequestInit,
  onProgress: (progress: Progress) => void,
  fallbackMessage = 'Request failed',
  signal?: AbortSignal,
): Promise<T> {
  const headers = { ...(init.headers as Record<string, string> | undefined), Accept: 'application/x-ndjson' };
  const response = await fetch(`${API_BASE}${url}`, { ...init, headers, signal });
  if (!response.ok || !response.body) {
    const body = await response.json().catch(() => null);
    throw new ApiError(typeof body?.detail === 'string' ? body.detail : fallbackMessage, response.status);
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let pending = '';
  let result: { value: T } | null = null;

  const handle = (line: string) => {
    if (!line.trim()) return;
    const event = JSON.parse(line) as StreamEvent<T>;
    if (event.type === 'progress') onProgress({ done: event.done, total: event.total });
    else if (event.type === 'done') result = { value: event.result };
    else throw new ApiError(event.detail || fallbackMessage, event.status);
  };

  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    pending += decoder.decode(value, { stream: true });
    const lines = pending.split('\n');
    pending = lines.pop() ?? '';
    lines.forEach(handle);
  }
  handle(pending);

  // The stream ended without a result: the connection broke part-way.
  if (!result) throw new ApiError(fallbackMessage, 502);
  return (result as { value: T }).value;
}

export function jsonBody(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
