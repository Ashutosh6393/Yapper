import { db, note } from "@yapper/db";
import { deriveNoteMetadata } from "@yapper/editor/collab";
import { loadNoteAudience, publishPokes, type RedisPublisher } from "@yapper/permissions";
import { eq, sql } from "drizzle-orm";
import type * as Y from "yjs";

/**
 * Derive `{ title, preview }` from the collaborative doc and write them onto `note` with a fresh
 * `updated_at`, so the dashboard reflects edits. Derivation is the shared `deriveNoteMetadata`
 * (`@yapper/editor/collab`, ADR-0008) — the same helper the REST `PUT /content` path (spec 20) uses, so
 * both persistence paths derive identically. No React/DOM on this path.
 *
 * `metaVersion` is bumped on every save so the metadata lane's CVR diff (spec 16) surfaces the
 * content-driven title/preview change; without the bump a shared-note edit is invisible to the
 * dashboard pull (spec 23). Mirrors the REST `PUT /content` write, so both paths agree. After the
 * write we poke the note's audience (owner + active collaborators) so their open dashboards pull the
 * fresh metadata at once; `publisher` is `null` (no-op) when `REDIS_URL` is unset (dev/tests).
 */
export async function saveDerivedMetadata(
  noteId: string,
  doc: Y.Doc,
  publisher: RedisPublisher | null = null,
): Promise<void> {
  const { title, preview } = deriveNoteMetadata(doc);
  await db
    .update(note)
    .set({ title, preview, updatedAt: new Date(), metaVersion: sql`${note.metaVersion} + 1` })
    .where(eq(note.id, noteId));
  await publishPokes(publisher, await loadNoteAudience(noteId));
}
