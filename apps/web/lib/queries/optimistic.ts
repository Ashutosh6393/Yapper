import { type QueryClient, useMutation, useQueryClient } from "@tanstack/react-query";
import type { NoteSummary } from "@yapper/schemas";
import { toast } from "@/components/ui/sonner";
import { noteKeys } from "./notes";

/** A success toast for an optimistic note action, optionally carrying an Undo action. */
export interface OptimisticNoteToast {
  message: string;
  action?: { label: string; onClick: () => void };
}

/** Every cached notes list/shared slice (arrays of `NoteSummary`), excluding non-array entries like
 * the per-id `detail` metadata under the same `["notes", …]` root. Exported so the label mutations
 * can transform note chips across the same slices. */
export function noteListSlices(qc: QueryClient) {
  return qc
    .getQueriesData<NoteSummary[]>({ queryKey: noteKeys.all })
    .filter((entry): entry is [(typeof entry)[0], NoteSummary[]] => Array.isArray(entry[1]));
}

/**
 * Optimistic mutation over the note-list cache (the documented TanStack pattern):
 * `onMutate` cancels in-flight refetches, snapshots **every** list/shared slice, and applies
 * `transform` to each (default: drop the mutated note id — so a note leaves the active view AND any
 * cached label view at once, fixing cross-view staleness); `onError` restores every snapshot + error
 * toasts; `onSuccess` fires an optional success/Undo toast; `onSettled` invalidates to reconcile.
 */
export function useOptimisticNoteListMutation(opts: {
  mutationFn: (id: string) => Promise<unknown>;
  errorMessage: string;
  successToast?: (id: string) => OptimisticNoteToast;
  transform?: (notes: NoteSummary[], id: string) => NoteSummary[];
}) {
  const qc = useQueryClient();
  const transform = opts.transform ?? ((notes, id) => notes.filter((n) => n.id !== id));
  return useMutation({
    mutationFn: opts.mutationFn,
    onMutate: async (id: string) => {
      await qc.cancelQueries({ queryKey: noteKeys.all });
      const snapshots = noteListSlices(qc);
      for (const [key, data] of snapshots) qc.setQueryData(key, transform(data, id));
      return { snapshots };
    },
    onError: (_err, _id, ctx) => {
      for (const [key, data] of ctx?.snapshots ?? []) qc.setQueryData(key, data);
      toast.error(opts.errorMessage);
    },
    onSuccess: (_data, id) => {
      const t = opts.successToast?.(id);
      if (t) toast.success(t.message, t.action ? { action: t.action } : undefined);
    },
    onSettled: () => qc.invalidateQueries({ queryKey: noteKeys.all }),
  });
}
