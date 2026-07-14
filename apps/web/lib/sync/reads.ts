import type { Label, NoteMetadata } from "@yapper/schemas";
import { useLiveQuery } from "dexie-react-hooks";
import type { NoteFilter } from "../dashboard-view";
import { useLabels } from "../queries/labels";
import { useNote, useNotes } from "../queries/notes";
import { db, type LocalNote } from "./db";
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

/** Owned lifecycle view (`active` | `archived` | `trashed`), optionally filtered to one label.
 * Collaborator notes also live in `db.notes` (so the editor can read their access locally), so exclude
 * them here — `isOwner === false` is a note shared *with* the user; `!== false` keeps owned + any
 * pre-`isOwner` row that hasn't been re-pulled yet (self-heals rather than briefly hiding owned notes). */
export function useLocalNotes(filter: NoteFilter, labelId?: string | null) {
  return useLiveQuery(() => {
    if (labelId) {
      // A label view pins the active lifecycle (see dashboard-view.ts filterForView).
      return db.notes
        .where("labelIds")
        .equals(labelId)
        .filter((n) => n.lifecycle === "active" && n.isOwner !== false)
        .toArray();
    }
    return db.notes
      .where("lifecycle")
      .equals(filter)
      .filter((n) => n.isOwner !== false)
      .toArray();
  }, [filter, labelId]);
}

/**
 * A single materialized note (owner controls read `isOwner`). The `?? null` is load-bearing:
 * `useLiveQuery` yields `undefined` while it resolves *and* `db.notes.get` yields `undefined` for a row
 * that isn't there, so without a sentinel the two are indistinguishable. `undefined` = haven't looked
 * yet; `null` = looked, it's gone.
 */
export function useLocalNote(id: string) {
  return useLiveQuery(async () => (await db.notes.get(id)) ?? null, [id]);
}

/** The sidebar label list. */
export function useLocalLabels() {
  return useLiveQuery(() => db.labels.toArray(), []);
}

/**
 * Owner's label list, flag-gated on the stable flag: `db.labels` when the sync engine is on (so
 * optimistic create/rename/delete show at once), today's TanStack Query `useLabels` otherwise. Returns
 * `Label[] | undefined` (undefined = loading), the shape the sidebar/label editor already read.
 */
export function useLabelList(): Label[] | undefined {
  if (isSyncEngineEnabled()) {
    // biome-ignore lint/correctness/useHookAtTopLevel: flag is constant per process (see useNoteList).
    return useLocalLabels();
  }
  // biome-ignore lint/correctness/useHookAtTopLevel: stable-flag branch (see useNoteList).
  return useLabels().data;
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

/**
 * The three states a note detail can actually be in (spec 25d). `undefined` alone conflated all three,
 * which is why the dialog used to render an editor for a note that did not exist.
 */
export type NoteDetailStatus = "loading" | "found" | "missing";

/**
 * Single note detail, flag-gated: `db.notes.get(id)` when the engine is on, else Query `useNote`.
 *
 * `missing` is reachable through an ordinary flow, not just a typo'd URL: the owner makes a note private
 * (spec 07) and the collaborator's link now points at a row they can no longer read. The socket's `kick`
 * only reaches a *connected* editor, so a collaborator who was offline at revoke time meets this state on
 * their next open.
 */
export function useNoteDetail(id: string): {
  note: LocalNote | NoteMetadata | undefined;
  status: NoteDetailStatus;
} {
  if (isSyncEngineEnabled()) {
    // biome-ignore lint/correctness/useHookAtTopLevel: stable-flag branch (see useNoteList).
    const note = useLocalNote(id);
    if (note === undefined) return { note: undefined, status: "loading" };
    if (note === null) return { note: undefined, status: "missing" };
    return { note, status: "found" };
  }
  // biome-ignore lint/correctness/useHookAtTopLevel: stable-flag branch (see useNoteList).
  const query = useNote(id);
  // A 404 lands here as `isPending: false` with no data — the same "gone" the Dexie path reports as null.
  if (query.isPending) return { note: undefined, status: "loading" };
  return query.data
    ? { note: query.data, status: "found" }
    : { note: undefined, status: "missing" };
}
