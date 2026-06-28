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

/** A note in "Shared with me" — like {@link NoteSummary} plus the note-level access role. */
export interface SharedNoteSummary extends NoteSummary {
  access: NoteAccess;
}

/** Result of enabling/updating sharing on a note: the capability link + the new access level. */
export interface ShareInfo {
  token: string;
  url: string;
  access: NoteAccess;
}

/** Note summary shown on the `/share/:token` join page (before the user joins). */
export interface ShareSummary {
  id: string;
  title: string;
  access: NoteAccess;
}

/** Shape returned by create / get-one. */
export interface NoteMetadata {
  id: string;
  title: string;
  preview: string;
  access: NoteAccess;
  createdAt: string;
  updatedAt: string;
  /** Whether the caller owns this note — gates the Share/Delete controls. Present on get-one. */
  isOwner?: boolean;
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
  listShared: () => api<SharedNoteSummary[]>("/api/notes/shared"),
  create: () => api<NoteMetadata>("/api/notes", { method: "POST" }),
  get: (id: string) => api<NoteMetadata>(`/api/notes/${id}`),
  remove: (id: string) => api<void>(`/api/notes/${id}`, { method: "DELETE" }),
  share: (id: string, level: Exclude<NoteAccess, "private">) =>
    api<ShareInfo>(`/api/notes/${id}/share`, {
      method: "POST",
      body: JSON.stringify({ level }),
    }),
  makePrivate: (id: string) => api<void>(`/api/notes/${id}/private`, { method: "POST" }),
};

/** Capability-link join flow (the `/share/:token` page). Both calls require a session. */
export const shareApi = {
  get: (token: string) => api<ShareSummary>(`/api/share/${token}`),
  join: (token: string) => api<{ noteId: string }>(`/api/share/${token}/join`, { method: "POST" }),
};

/**
 * Fetch a fresh Better Auth JWT (jwt plugin's `/token`, gated by the session cookie) for the
 * socket handshake. Called per (re)connect so the short-lived token never outlives a reconnect.
 */
export async function getAuthToken(): Promise<string> {
  const { token } = await api<{ token: string }>("/api/auth/token");
  return token;
}
