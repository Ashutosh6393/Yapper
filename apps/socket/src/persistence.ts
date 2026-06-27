import { db, noteDoc } from "@yapper/db";
import { eq } from "drizzle-orm";

/**
 * DB-facing helpers for the Yjs document lifecycle. The CRDT state is a single full-state blob per
 * note (`Y.encodeStateAsUpdate`), upserted on each debounced save (ADR-002). Handshake authorization
 * (owner/collaborator lookup) lives in `@yapper/permissions`, not here.
 */

/** Stored Yjs update for a note, or `null` for a doc that has never been saved. */
export async function loadDocState(noteId: string): Promise<Buffer | null> {
  const [row] = await db
    .select({ state: noteDoc.state })
    .from(noteDoc)
    .where(eq(noteDoc.noteId, noteId))
    .limit(1);
  return row?.state ?? null;
}

/** Upsert the full Yjs state blob for a note (1:1 with `note`), refreshing `updated_at`. */
export async function saveDocState(noteId: string, state: Buffer): Promise<void> {
  await db
    .insert(noteDoc)
    .values({ noteId, state })
    .onConflictDoUpdate({ target: noteDoc.noteId, set: { state, updatedAt: new Date() } });
}
