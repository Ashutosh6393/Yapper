import { TiptapTransformer } from "@hocuspocus/transformer";
import { db, note } from "@yapper/db";
import { COLLAB_FIELD, extractTitlePreview, type PmNode } from "@yapper/editor/derive";
import { eq } from "drizzle-orm";
import type * as Y from "yjs";

/**
 * Derive `{ title, preview }` from the collaborative doc and write them onto `note` with a fresh
 * `updated_at`, so the dashboard reflects edits. Server-side parsing uses the shared schema via
 * `@hocuspocus/transformer` (Y.Doc → ProseMirror JSON) + the pure `@yapper/editor` derivation
 * (ADR-001) — no React/DOM on this path.
 */
export async function saveDerivedMetadata(noteId: string, doc: Y.Doc): Promise<void> {
  const json: PmNode = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  const { title, preview } = extractTitlePreview(json);
  await db.update(note).set({ title, preview, updatedAt: new Date() }).where(eq(note.id, noteId));
}
