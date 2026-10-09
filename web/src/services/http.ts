/** Thin fetch wrapper that turns FastAPI error payloads into readable Errors. */
export async function request<T>(url: string, init?: RequestInit, fallbackMessage = 'Request failed'): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const body = await response.json().catch(() => null);
    const detail = typeof body?.detail === 'string' ? body.detail : null;
    throw new Error(detail ?? (fallbackMessage || `HTTP error ${response.status}`));
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
