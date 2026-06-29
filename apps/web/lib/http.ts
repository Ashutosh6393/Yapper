/**
 * Low-level fetch for the `api` app. Sends credentials so the Better Auth session cookie (set on the
 * api origin) rides along cross-origin. Throws {@link ApiError} on non-2xx. Returns parsed JSON as
 * `unknown` — callers validate the shape with a `@yapper/schemas` schema.
 */
export const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed with status ${status}`);
    this.name = "ApiError";
  }
}

export async function apiFetch(path: string, init?: RequestInit): Promise<unknown> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined;
  return res.json();
}
