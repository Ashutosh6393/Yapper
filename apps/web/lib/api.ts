/**
 * Typed fetch wrapper for the `api` app. Sends credentials so the Better Auth session cookie
 * (set on the api origin) rides along cross-origin. Throws {@link ApiError} on non-2xx.
 */
const API_URL = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000";

export type NoteAccess = "private" | "view" | "edit";

/** Shape returned by the list endpoint — metadata only, never the CRDT blob. */
export interface NoteSummary {
  id: string;
  title: string;
  preview: string;
  updatedAt: string;
}

/** Shape returned by create / get-one. */
export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  access: NoteAccess;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(public readonly status: number) {
    super(`Request failed with status ${status}`);
    this.name = "ApiError";
  }
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${API_URL}${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  if (!res.ok) throw new ApiError(res.status);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const notesApi = {
  list: () => api<NoteSummary[]>("/api/notes"),
  create: () => api<NoteMetadata>("/api/notes", { method: "POST" }),
  get: (id: string) => api<NoteMetadata>(`/api/notes/${id}`),
  remove: (id: string) => api<void>(`/api/notes/${id}`, { method: "DELETE" }),
};
