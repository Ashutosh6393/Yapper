import { useLiveQuery } from "dexie-react-hooks";
import type { NoteFilter } from "../dashboard-view";
import { useNote, useNotes } from "../queries/notes";
import { db } from "./db";
import { isSyncEngineEnabled } from "./flag";

/**
 * Reactive read selectors over the materialized Dexie store (ADR-0003, spec 15). `useLiveQuery`
 * re-runs and re-renders whenever the queried tables change — including from another tab (Dexie
 * observes IndexedDB origin-wide). Every selector returns `undefined` on the first tick (before Dexie
 * resolves); callers treat `undefined` as **loading** (skeleton), never as "empty".
 *
 * These read from `db.notes` / `db.labels` only; the flag-gated `useNoteList` / `useNoteDetail`
 * adapters below pick Dexie vs the TanStack Query path once, on the stable flag.
 */

/** Owned lifecycle view (`active` | `archived` | `trashed`), optionally filtered to one label. */
export function useLocalNotes(filter: NoteFilter, labelId?: string | null) {
  return useLiveQuery(() => {
    if (labelId) {
      // A label view pins the active lifecycle (see dashboard-view.ts filterForView).
      return db.notes
        .where("labelIds")
        .equals(labelId)
        .filter((n) => n.lifecycle === "active")
        .toArray();
    }
    return db.notes.where("lifecycle").equals(filter).toArray();
  }, [filter, labelId]);
}

/** A single materialized note (owner controls read `isOwner`). */
export function useLocalNote(id: string) {
  return useLiveQuery(() => db.notes.get(id), [id]);
}

/** The sidebar label list. */
export function useLocalLabels() {
  return useLiveQuery(() => db.labels.toArray(), []);
}

/**
 * Owned note list, picking the source once on the **stable** flag: `db.notes` when the sync engine is
 * on, today's TanStack Query `useNotes` otherwise. Returns `{ notes, loading }` normalized to the shape
 * the dashboard already reads. `enabled` mirrors today's `!isShared` (the owned fetch is off on the
 * Shared view). The conditional-hook branch is safe because `isSyncEngineEnabled()` is constant for the
 * process lifetime — the branch never flips mid-session (same rationale as `<SyncEngineProvider>`).
 *
 * The Shared-with-me view stays on `useSharedNotes` in both flag states (`NoteMeta` has no owner
 * marker; deferred to spec 16), so this adapter is owned-only.
 */
export function useNoteList(filter: NoteFilter, labelId: string | null, enabled = true) {
  if (isSyncEngineEnabled()) {
    // biome-ignore lint/correctness/useHookAtTopLevel: flag is constant per process — stable hook order (see doc comment).
    const notes = useLocalNotes(filter, labelId);
    return { notes, loading: notes === undefined };
  }
  // biome-ignore lint/correctness/useHookAtTopLevel: stable-flag branch (see above).
  const query = useNotes(filter, labelId, enabled);
  return { notes: query.data, loading: query.isPending };
}

/** Single note detail, flag-gated: `db.notes.get(id)` when the engine is on, else Query `useNote`. */
export function useNoteDetail(id: string) {
  if (isSyncEngineEnabled()) {
    // biome-ignore lint/correctness/useHookAtTopLevel: stable-flag branch (see useNoteList).
    const note = useLocalNote(id);
    return { note, loading: note === undefined };
  }
  // biome-ignore lint/correctness/useHookAtTopLevel: stable-flag branch (see useNoteList).
  const query = useNote(id);
  return { note: query.data, loading: query.isPending };
}
