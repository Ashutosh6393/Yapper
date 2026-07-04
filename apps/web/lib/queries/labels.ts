import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CreateLabelBody, labelSchema } from "@yapper/schemas";
import { apiFetch } from "../http";
import { noteKeys } from "./notes";

/** Query-key factory for the owner's labels. */
export const labelKeys = {
  all: ["labels"] as const,
};

/** The caller's labels with active-note counts (sidebar list). */
export function useLabels() {
  return useQuery({
    queryKey: labelKeys.all,
    queryFn: async () => labelSchema.array().parse(await apiFetch("/api/labels")),
  });
}

/** Create a label; refreshes the label list. */
export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLabelBody) =>
      labelSchema.parse(
        await apiFetch("/api/labels", { method: "POST", body: JSON.stringify(body) }),
      ),
    onSuccess: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
  });
}

/** Delete a label (notes keep existing, lose the label); refreshes labels + note lists. */
export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/labels/${id}`, { method: "DELETE" });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: labelKeys.all });
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

/** Replace a note's whole label set (PUT); refreshes note lists (chips) + label counts. */
export function useSetNoteLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, labelIds }: { noteId: string; labelIds: string[] }) => {
      await apiFetch(`/api/notes/${noteId}/labels`, {
        method: "PUT",
        body: JSON.stringify({ labelIds }),
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all });
      qc.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}
