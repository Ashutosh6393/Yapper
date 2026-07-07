import { randomBytes } from "node:crypto";
import { type Database, note, noteCollaborator } from "@yapper/db";
import type { NoteAccess } from "@yapper/schemas";
import { eq } from "drizzle-orm";

/**
 * The note lifecycle/sharing DB writes, extracted from `notes/router.ts` so the REST routes (flag-off)
 * and spec-19's server mutators (flag-on) run the **same** SQL — semantics can't drift mid-migration
 * (spec 19, decisions ADR-001). Each takes an `Executor` (the shared `db` or a transaction handle), so
 * a mutator can compose the write into its push transaction. These do **no** authorization, cache
 * busting, or Redis publishing — the caller owns those (post-commit for mutators).
 */

/** The shared `db` client or a Drizzle transaction — either can run these query-builder writes. */
export type Executor = Database | Parameters<Parameters<Database["transaction"]>[0]>[0];

/** A cryptographically-random, URL-safe bearer token for a capability link (still gated by login). */
export function mintShareToken(): string {
  return randomBytes(24).toString("base64url");
}

/**
 * Set a note's title. No REST endpoint today (title is content-derived — spec 20); the engine's
 * `renameNote` mutator is an explicit metadata override (spec 19, decisions ADR-005).
 */
export async function renameNote(dbx: Executor, id: string, title: string): Promise<void> {
  await dbx.update(note).set({ title, updatedAt: new Date() }).where(eq(note.id, id));
}

/** Set `archived_at = now()` (My Notes → Archive). */
export async function archiveNote(dbx: Executor, id: string): Promise<void> {
  await dbx.update(note).set({ archivedAt: new Date() }).where(eq(note.id, id));
}

/** Clear `archived_at` (Archive → active). */
export async function unarchiveNote(dbx: Executor, id: string): Promise<void> {
  await dbx.update(note).set({ archivedAt: null }).where(eq(note.id, id));
}

/** Set `trashed_at = now()` (soft delete). Caller busts the note's cached permissions. */
export async function trashNote(dbx: Executor, id: string): Promise<void> {
  await dbx.update(note).set({ trashedAt: new Date() }).where(eq(note.id, id));
}

/** Clear both lifecycle timestamps (back to active). Caller busts cached permissions. */
export async function restoreNote(dbx: Executor, id: string): Promise<void> {
  await dbx.update(note).set({ trashedAt: null, archivedAt: null }).where(eq(note.id, id));
}

/** Hard delete a note (FK cascade to note_doc / note_collaborator / note_label). */
export async function permanentlyDeleteNote(dbx: Executor, id: string): Promise<void> {
  await dbx.delete(note).where(eq(note.id, id));
}

/** Set the note's access level and (re)apply the capability token. Caller mints/loads the token. */
export async function setNoteShareLevel(
  dbx: Executor,
  id: string,
  level: Exclude<NoteAccess, "private">,
  token: string,
): Promise<void> {
  await dbx
    .update(note)
    .set({ access: level, shareToken: token, updatedAt: new Date() })
    .where(eq(note.id, id));
}

/**
 * Make a note private: set `access = private`, clear the token, and revoke every collaborator. Both
 * writes go through the passed executor so the caller can wrap them in one transaction (the REST route
 * and the push handler both do). Caller busts cached permissions and publishes the revoke event.
 */
export async function makeNotePrivate(dbx: Executor, id: string): Promise<void> {
  await dbx
    .update(note)
    .set({ access: "private", shareToken: null, updatedAt: new Date() })
    .where(eq(note.id, id));
  await dbx
    .update(noteCollaborator)
    .set({ status: "revoked" })
    .where(eq(noteCollaborator.noteId, id));
}
