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
  list: () => [...noteKeys.all, "list"] as const,
  shared: () => [...noteKeys.all, "shared"] as const,
  detail: (id: string) => [...noteKeys.all, "detail", id] as const,
};

/** "My Notes" — the caller's owned notes (metadata only). */
export function useNotes() {
  return useQuery({
    queryKey: noteKeys.list(),
    queryFn: async () => noteSummarySchema.array().parse(await apiFetch("/api/notes")),
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
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.list() }),
  });
}

export function useDeleteNote() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/notes/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.list() });
      qc.invalidateQueries({ queryKey: noteKeys.shared() });
    },
  });
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
      qc.invalidateQueries({ queryKey: noteKeys.shared() });
      qc.invalidateQueries({ queryKey: noteKeys.list() });
    },
  });
}
