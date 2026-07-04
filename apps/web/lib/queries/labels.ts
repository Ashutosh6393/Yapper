import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type CreateLabelBody, type Label, type LabelChip, labelSchema } from "@yapper/schemas";
import { toast } from "@/components/ui/sonner";
import { apiFetch } from "../http";
import { noteKeys } from "./notes";
import { noteListSlices } from "./optimistic";

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

/** Create a label — optimistically appended (temp id) so it shows at once, swapped for the server
 * row on success, rolled back + error-toasted on failure. */
export function useCreateLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: CreateLabelBody) =>
      labelSchema.parse(
        await apiFetch("/api/labels", { method: "POST", body: JSON.stringify(body) }),
      ),
    onMutate: async (body: CreateLabelBody) => {
      await qc.cancelQueries({ queryKey: labelKeys.all });
      const prev = qc.getQueryData<Label[]>(labelKeys.all);
      const tempId = `temp-${crypto.randomUUID()}`;
      const optimistic: Label = { id: tempId, name: body.name, color: body.color, noteCount: 0 };
      qc.setQueryData<Label[]>(labelKeys.all, [...(prev ?? []), optimistic]);
      return { prev, tempId };
    },
    onError: (_err, _body, ctx) => {
      if (ctx) qc.setQueryData(labelKeys.all, ctx.prev);
      toast.error("Couldn't create label");
    },
    onSuccess: (created, _body, ctx) => {
      // Swap the temp row for the real server row (keeps its id stable for the note editor).
      qc.setQueryData<Label[]>(labelKeys.all, (labels) =>
        (labels ?? []).map((l) => (l.id === ctx?.tempId ? created : l)),
      );
    },
    onSettled: () => qc.invalidateQueries({ queryKey: labelKeys.all }),
  });
}

/** Delete a label — optimistically removed from the label list AND stripped from every cached
 * note's chips (across all list slices), rolled back on failure. */
export function useDeleteLabel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await apiFetch(`/api/labels/${id}`, { method: "DELETE" });
    },
    onMutate: async (id: string) => {
      await Promise.all([
        qc.cancelQueries({ queryKey: labelKeys.all }),
        qc.cancelQueries({ queryKey: noteKeys.all }),
      ]);
      const labelsPrev = qc.getQueryData<Label[]>(labelKeys.all);
      const noteSnapshots = noteListSlices(qc);
      qc.setQueryData<Label[]>(labelKeys.all, (labels) =>
        (labels ?? []).filter((l) => l.id !== id),
      );
      for (const [key, notes] of noteSnapshots) {
        qc.setQueryData(
          key,
          notes.map((n) => ({ ...n, labels: n.labels.filter((c) => c.id !== id) })),
        );
      }
      return { labelsPrev, noteSnapshots };
    },
    onError: (_err, _id, ctx) => {
      if (ctx) {
        qc.setQueryData(labelKeys.all, ctx.labelsPrev);
        for (const [key, notes] of ctx.noteSnapshots) qc.setQueryData(key, notes);
      }
      toast.error("Couldn't delete label");
    },
    onSuccess: () => toast.success("Label deleted"),
    onSettled: () => {
      qc.invalidateQueries({ queryKey: labelKeys.all });
      qc.invalidateQueries({ queryKey: noteKeys.all });
    },
  });
}

/** Replace a note's whole label set (PUT) — optimistically rewrites the note's chips (resolved from
 * the labels cache) across every list slice, dropping it from a label-filtered slice it no longer
 * matches. Rolled back + error-toasted on failure. */
export function useSetNoteLabels() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId, labelIds }: { noteId: string; labelIds: string[] }) => {
      await apiFetch(`/api/notes/${noteId}/labels`, {
        method: "PUT",
        body: JSON.stringify({ labelIds }),
      });
    },
    onMutate: async ({ noteId, labelIds }) => {
      await qc.cancelQueries({ queryKey: noteKeys.all });
      const labels = qc.getQueryData<Label[]>(labelKeys.all) ?? [];
      const chips: LabelChip[] = labelIds
        .map((id) => labels.find((l) => l.id === id))
        .filter((l): l is Label => Boolean(l))
        .map((l) => ({ id: l.id, name: l.name, color: l.color }));
      const noteSnapshots = noteListSlices(qc);
      for (const [key, notes] of noteSnapshots) {
        // A label-filtered slice: ["notes","list",filter,labelId]. Drop the note if it no longer
        // carries that label; otherwise rewrite its chips.
        const filterLabelId = key[1] === "list" ? (key[3] as string | null) : null;
        const next = notes
          .map((n) => (n.id === noteId ? { ...n, labels: chips } : n))
          .filter(
            (n) => !(n.id === noteId && filterLabelId != null && !labelIds.includes(filterLabelId)),
          );
        qc.setQueryData(key, next);
      }
      return { noteSnapshots };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx) for (const [key, notes] of ctx.noteSnapshots) qc.setQueryData(key, notes);
      toast.error("Couldn't update labels");
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: noteKeys.all });
      qc.invalidateQueries({ queryKey: labelKeys.all });
    },
  });
}
