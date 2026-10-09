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

export function jsonBody(payload: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  };
}
