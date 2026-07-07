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
import { isSyncEngineEnabled } from "../sync/flag";
import { useOptimisticNoteListMutation } from "./optimistic";

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
    mutationFn: async () => {
      // With the sync engine on, the client mints the note id (crypto.randomUUID) so the note has a
      // stable identity offline (ADR-0006); the server accepts it idempotently. Flag off keeps today's
      // server-generated create (no id sent) byte-for-byte.
      const body = isSyncEngineEnabled() ? JSON.stringify({ id: crypto.randomUUID() }) : undefined;
      return createNoteResponseSchema.parse(await apiFetch("/api/notes", { method: "POST", body }));
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}

/** Unarchive an owned note (Archive → My Notes). Optimistic (drops it from the Archive view). */
export function useUnarchiveNote() {
  return useOptimisticNoteListMutation({
    mutationFn: (id) => apiFetch(`/api/notes/${id}/unarchive`, { method: "POST" }),
    errorMessage: "Couldn't unarchive note",
  });
}

/** Archive an owned note (My Notes → Archive). Reversible; no collaborator impact. Success toast
 * carries Undo → unarchive (ADR-004: Undo fires the inverse mutation, never a cache re-add). */
export function useArchiveNote() {
  const unarchive = useUnarchiveNote();
  return useOptimisticNoteListMutation({
    mutationFn: (id) => apiFetch(`/api/notes/${id}/archive`, { method: "POST" }),
    errorMessage: "Couldn't archive note",
    successToast: (id) => ({
      message: "Note archived",
      action: { label: "Undo", onClick: () => unarchive.mutate(id) },
    }),
  });
}

/** Restore a trashed note back to active. Optimistic (drops it from the Trash view). */
export function useRestoreNote() {
  return useOptimisticNoteListMutation({
    mutationFn: (id) => apiFetch(`/api/notes/${id}/restore`, { method: "POST" }),
    errorMessage: "Couldn't restore note",
  });
}

/** Move an owned note to Trash (soft delete). Reversible; success toast carries Undo → restore. */
export function useTrashNote() {
  const restore = useRestoreNote();
  return useOptimisticNoteListMutation({
    mutationFn: (id) => apiFetch(`/api/notes/${id}/trash`, { method: "POST" }),
    errorMessage: "Couldn't move note to Trash",
    successToast: (id) => ({
      message: "Moved to Trash",
      action: { label: "Undo", onClick: () => restore.mutate(id) },
    }),
  });
}

/** Permanently delete a trashed note (irreversible; server 409s unless already trashed). */
export function usePermanentDelete() {
  return useOptimisticNoteListMutation({
    mutationFn: (id) => apiFetch(`/api/notes/${id}`, { method: "DELETE" }),
    errorMessage: "Couldn't delete note",
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
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}
