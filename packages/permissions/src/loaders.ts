import { db, note, noteCollaborator } from "@yapper/db";
import { and, eq } from "drizzle-orm";
import type { ResolveDeps } from "./resolve";

/**
 * Default db-backed loaders for {@link resolvePermission}. `api` and `socket` use these in prod; the
 * derivation/cache logic stays db-free and unit-testable by keeping the queries here.
 */

/** Load a note's `ownerId` + `access` + `trashedAt`, or `null` if it does not exist. */
export const loadNote: ResolveDeps["loadNote"] = async (noteId) => {
  const [row] = await db
    .select({ ownerId: note.ownerId, access: note.access, trashedAt: note.trashedAt })
    .from(note)
    .where(eq(note.id, noteId))
    .limit(1);
  return row ?? null;
};

/** True iff the user holds an `active` collaborator row on the note. */
export const isActiveCollaborator: ResolveDeps["isActiveCollaborator"] = async (noteId, userId) => {
  const [row] = await db
    .select({ id: noteCollaborator.id })
    .from(noteCollaborator)
    .where(
      and(
        eq(noteCollaborator.noteId, noteId),
        eq(noteCollaborator.userId, userId),
        eq(noteCollaborator.status, "active"),
      ),
    )
    .limit(1);
  return row !== undefined;
};

/**
 * The poke **audience** for a touched note (spec 17): its owner + every current **active** collaborator.
 * The same membership set `effectivePermission` grants view/edit for, so a poke reaches exactly the
 * users whose authorized view could have changed. Returns `[]` for a missing note (e.g. hard-deleted);
 * de-dup is the caller's job (`publishPokes`).
 */
export async function loadNoteAudience(noteId: string): Promise<string[]> {
  const [owner] = await db
    .select({ ownerId: note.ownerId })
    .from(note)
    .where(eq(note.id, noteId))
    .limit(1);
  if (!owner) return [];
  const collaborators = await db
    .select({ userId: noteCollaborator.userId })
    .from(noteCollaborator)
    .where(and(eq(noteCollaborator.noteId, noteId), eq(noteCollaborator.status, "active")));
  return [owner.ownerId, ...collaborators.map((c) => c.userId)];
}
