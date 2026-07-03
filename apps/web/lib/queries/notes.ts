import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createNoteResponseSchema,
  noteMetadataSchema,
  noteSummarySchema,
  type ShareNoteBody,
  sharedNoteSummarySchema,
  shareInfoSchema,
} from "@yapper/schemas";
import { apiFetch } from "../http";

/** Query-key factory so mutations can invalidate the right slices of the notes cache. */
export const noteKeys = {
  all: ["notes"] as const,
  list: (filter: string, labelId?: string | null) =>
    [...noteKeys.all, "list", filter, labelId ?? null] as const,
  shared: () => [...noteKeys.all, "shared"] as const,
  detail: (id: string) => [...noteKeys.all, "detail", id] as const,
};

/** Owned notes for one lifecycle view (metadata + embedded labels). `active` (default) excludes
 * archived/trashed; a `labelId` filters active notes to that label. Keyed per (filter,label) so
 * each view caches independently. `enabled: false` skips the fetch (e.g. on the Shared view). */
export function useNotes(
  filter: "active" | "archived" | "trashed" = "active",
  labelId?: string | null,
  enabled = true,
) {
  const params = new URLSearchParams({ filter });
  if (labelId) params.set("label", labelId);
  return useQuery({
    queryKey: noteKeys.list(filter, labelId),
    queryFn: async () => noteSummarySchema.array().parse(await apiFetch(`/api/notes?${params}`)),
    enabled,
  });
}

/** "Shared with me" — notes the caller joined that are still shared. */
export function useSharedNotes() {
  return useQuery({
    queryKey: noteKeys.shared(),
    queryFn: async () => sharedNoteSummarySchema.array().parse(await apiFetch("/api/notes/shared")),
  });
}

/** Full metadata for one note (404 → throws ApiError, surfaced as the query error). */
export function useNote(id: string) {
  return useQuery({
    queryKey: noteKeys.detail(id),
    queryFn: async () => noteMetadataSchema.parse(await apiFetch(`/api/notes/${id}`)),
    enabled: Boolean(id),
  });
}

export function useCreateNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () =>
      createNoteResponseSchema.parse(await apiFetch("/api/notes", { method: "POST" })),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

/** Shared shape for the note lifecycle mutations: hit a per-id endpoint, then invalidate every
 * notes list/shared slice so whichever view is active refetches. */
function useNoteLifecycleMutation(path: (id: string) => string, method: "POST" | "DELETE") {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(path(id), { method });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

/** Archive an owned note (My Notes → Archive). Reversible; no collaborator impact. */
export function useArchiveNote() {
  return useNoteLifecycleMutation((id) => `/api/notes/${id}/archive`, "POST");
}

/** Unarchive an owned note (Archive → My Notes). */
export function useUnarchiveNote() {
  return useNoteLifecycleMutation((id) => `/api/notes/${id}/unarchive`, "POST");
}

/** Move an owned note to Trash (soft delete). Reversible via restore. */
export function useTrashNote() {
  return useNoteLifecycleMutation((id) => `/api/notes/${id}/trash`, "POST");
}

/** Restore a trashed note back to active. */
export function useRestoreNote() {
  return useNoteLifecycleMutation((id) => `/api/notes/${id}/restore`, "POST");
}

/** Permanently delete a trashed note (irreversible; server 409s unless already trashed). */
export function usePermanentDelete() {
  return useNoteLifecycleMutation((id) => `/api/notes/${id}`, "DELETE");
}

/** Enable/update sharing for a note; invalidates that note's metadata so `access` refreshes. */
export function useShareNote(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (level: ShareNoteBody["level"]) =>
      shareInfoSchema.parse(
        await apiFetch(`/api/notes/${id}/share`, {
          method: "POST",
          body: JSON.stringify({ level }),
        }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.detail(id) }),
  });
}

/** Make a note private (revokes collaborators, rotates the token). */
export function useMakePrivate(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await apiFetch(`/api/notes/${id}/private`, { method: "POST" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.detail(id) });
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
