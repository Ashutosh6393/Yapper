import type { LabelColor, Mutation, NoteAccess } from "@yapper/schemas";
import { db, rebuild } from "./db";
// Importing the registry wires the 14 client-mutator bodies into rebuild()'s fold (side effect).
import "./mutators";
import { schedulePush } from "./push";

/**
 * The write entrypoint for the sync engine (spec 19). Every metadata action goes through `enqueue`:
 * append `{ seq (auto), name, args }` to `db.mutations`, `rebuild()` so `db.notes` / `db.labels` reflect
 * the optimistic effect immediately (the UI reads them via `useLiveQuery`), then nudge the pusher. The
 * thin per-action helpers below are what the dashboard/editor call.
 */
export async function enqueue(mutation: Mutation): Promise<void> {
  await db.mutations.add(mutation);
  await rebuild();
  schedulePush();
}

/** Share level the owner can set (private is `makePrivate`, not a share level). */
type ShareLevel = Exclude<NoteAccess, "private">;

export const createNote = (id: string, title?: string): Promise<void> =>
  enqueue({ name: "createNote", args: title === undefined ? { id } : { id, title } });

export const renameNote = (id: string, title: string): Promise<void> =>
  enqueue({ name: "renameNote", args: { id, title } });

export const archiveNote = (id: string): Promise<void> =>
  enqueue({ name: "archiveNote", args: { id } });

export const unarchiveNote = (id: string): Promise<void> =>
  enqueue({ name: "unarchiveNote", args: { id } });

export const trashNote = (id: string): Promise<void> =>
  enqueue({ name: "trashNote", args: { id } });

export const restoreNote = (id: string): Promise<void> =>
  enqueue({ name: "restoreNote", args: { id } });

export const permanentDeleteNote = (id: string): Promise<void> =>
  enqueue({ name: "permanentDeleteNote", args: { id } });

export const setShareLevel = (id: string, level: ShareLevel): Promise<void> =>
  enqueue({ name: "setShareLevel", args: { id, level } });

export const makePrivate = (id: string): Promise<void> =>
  enqueue({ name: "makePrivate", args: { id } });

export const createLabel = (id: string, name: string, color: LabelColor): Promise<void> =>
  enqueue({ name: "createLabel", args: { id, name, color } });

export const renameLabel = (id: string, name: string): Promise<void> =>
  enqueue({ name: "renameLabel", args: { id, name } });

export const deleteLabel = (id: string): Promise<void> =>
  enqueue({ name: "deleteLabel", args: { id } });

export const applyLabel = (noteId: string, labelId: string): Promise<void> =>
  enqueue({ name: "applyLabel", args: { noteId, labelId } });

export const removeLabel = (noteId: string, labelId: string): Promise<void> =>
  enqueue({ name: "removeLabel", args: { noteId, labelId } });
