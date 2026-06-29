# packages/editor

Shared editor package (`@yapper/editor`) holding the single source of truth for Yapper's note document model: the canonical TipTap extension set (schema + collaborative binding) and a pure, framework-free helper that derives a note's `{ title, preview, text }` from its ProseMirror document. The web app uses the extensions to mount the live TipTap/Yjs editor; the socket server uses the derivation helper to compute note metadata after parsing a Yjs doc. Keeping both in one package guarantees the schema the editor produces matches the schema the server parses (ADR-001).

## Tech Stack

- **@tiptap/core** — `Extensions` type for the extension array.
- **@tiptap/starter-kit** — baseline node/mark schema (paragraphs, headings, marks, etc.). Built-in undo/redo history is disabled so collaboration owns it.
- **@tiptap/extension-collaboration** — binds the editor to a Yjs document for CRDT sync.
- **yjs** — `Y.Doc` type only (the collaborative document the extensions bind to).
- The derivation helper (`derive.ts`) has **no** TipTap/Yjs/React/DOM imports — it walks plain ProseMirror JSON, so it runs standalone under Bun on the server.

## File Structure

- `src/index.ts` — package entry (`.` export); re-exports the public API from `derive.ts` and `extensions.ts`.
- `src/extensions.ts` — `buildExtensions(doc)`: the canonical TipTap extension set bound to a Yjs doc.
- `src/derive.ts` — also the `./derive` subpath export; pure title/preview/text derivation plus its types and the `COLLAB_FIELD` constant.
- `src/derive.test.ts` — Bun tests for `extractTitlePreview` (fallback, title/preview split, empty-block skipping, truncation, inline-mark collapsing).
- `package.json` — `@yapper/editor`; `exports` maps `.` → `src/index.ts` and `./derive` → `src/derive.ts`.
- `tsconfig.json` — extends `@yapper/typescript-config/node.json`, Bun types.

## Exports

From `@yapper/editor` (`src/index.ts`):

- `buildExtensions(doc: Y.Doc): Extensions` — returns the canonical TipTap extension array (`StarterKit` with `undoRedo` disabled + `Collaboration` bound to `doc` on field `COLLAB_FIELD`). The schema it defines is the single source the server relies on when parsing docs.
- `extractTitlePreview(doc: PmNode | null | undefined): TitlePreview` — derives `{ title, preview, text }` from a ProseMirror JSON doc. First non-empty top-level block → `title` (capped 100 chars, `"Untitled"` fallback); remaining blocks → `preview` (capped 200 chars, ellipsized); all blocks joined by newlines → full `text`.
- `COLLAB_FIELD: "default"` — the Y.Doc XML-fragment field the `Collaboration` extension binds to; the server uses the same field name when converting the Yjs doc.
- `type PmNode` — minimal ProseMirror node slice (`{ type?, text?, content? }`) walked during derivation.
- `type TitlePreview` — `{ title: string; preview: string; text: string }`.

Subpath `@yapper/editor/derive` (`src/derive.ts`) exposes the same `extractTitlePreview`, `COLLAB_FIELD`, `PmNode`, and `TitlePreview` directly, without pulling in the TipTap/Yjs dependencies — import from here on the server to avoid loading editor libs.

## When to Use

- **web (editor UI):** mount the TipTap editor against the Hocuspocus provider's `Y.Doc`:
  `useEditor({ extensions: buildExtensions(provider.document) })`. This is the only place the full `@yapper/editor` entry (with TipTap/Yjs) is needed.
- **socket / api (metadata derivation):** after converting a Yjs doc to ProseMirror JSON (e.g. via `@hocuspocus/transformer`), call `extractTitlePreview(json)` to compute the `note` row's title/preview/text. Import from `@yapper/editor/derive` so the server doesn't pull in TipTap. Use `COLLAB_FIELD` as the field name when reading the collaborative fragment out of the doc.
- **Anywhere needing the doc's plain-text shape** (search indexing, dashboard cards): reuse `extractTitlePreview` rather than re-deriving title/preview, so every surface stays consistent with the editor's schema.
