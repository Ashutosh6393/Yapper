import { db, note } from "@yapper/db";
import { deriveNoteMetadata } from "@yapper/editor/collab";
import { eq } from "drizzle-orm";
import type * as Y from "yjs";

/**
 * Derive `{ title, preview }` from the collaborative doc and write them onto `note` with a fresh
 * `updated_at`, so the dashboard reflects edits. Derivation is the shared `deriveNoteMetadata`
 * (`@yapper/editor/collab`, ADR-0008) — the same helper the REST `PUT /content` path (spec 20) uses, so
 * both persistence paths derive identically. No React/DOM on this path.
 */
export async function saveDerivedMetadata(noteId: string, doc: Y.Doc): Promise<void> {
  const { title, preview } = deriveNoteMetadata(doc);
  await db.update(note).set({ title, preview, updatedAt: new Date() }).where(eq(note.id, noteId));
}
