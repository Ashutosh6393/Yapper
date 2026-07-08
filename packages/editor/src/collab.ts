import { TiptapTransformer } from "@hocuspocus/transformer";
import type * as Y from "yjs";
import { COLLAB_FIELD, extractTitlePreview } from "./derive";

/**
 * Derive server-authoritative `{ title, preview }` from a note's Yjs doc (ADR-0008). The **single**
 * source of truth for title/preview across the two persistence paths: the socket's `onStoreDocument`
 * (`apps/socket/src/metadata.ts`) and the REST `PUT /api/notes/:id/content` (spec 20). Both call this,
 * so a note's derived metadata is identical regardless of which writer persisted it.
 *
 * Lives on the `@yapper/editor/collab` subpath (not `./derive`) because it pulls
 * `@hocuspocus/transformer` + `yjs`; callers needing only plain-text extraction keep importing the
 * dependency-free `@yapper/editor/derive`.
 */
export function deriveNoteMetadata(doc: Y.Doc): { title: string; preview: string } {
  const json = TiptapTransformer.fromYdoc(doc, COLLAB_FIELD);
  const { title, preview } = extractTitlePreview(json);
  return { title, preview };
}
