import { db, note, noteCollaborator } from "@yapper/db";
import { and, eq } from "drizzle-orm";
import type { ResolveDeps } from "./resolve";

/**
 * Default db-backed loaders for {@link resolvePermission}. `api` and `socket` use these in prod; the
 * derivation/cache logic stays db-free and unit-testable by keeping the queries here.
 */

/** Load a note's `ownerId` + `access`, or `null` if it does not exist. */
export const loadNote: ResolveDeps["loadNote"] = async (noteId) => {
  const [row] = await db
    .select({ ownerId: note.ownerId, access: note.access })
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
