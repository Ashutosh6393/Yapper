# 04 · Editor & Realtime (single-user) — Implementation

## Status: in-progress

## Completed
1. `@yapper/editor` package: pure, framework-free `extractTitlePreview(doc)` + `COLLAB_FIELD`
   (`src/derive.ts`) — Untitled fallback, first-block title, following-blocks preview, truncation,
   inline-mark collapse. 5 unit tests (`src/derive.test.ts`). Shared TipTap `buildExtensions(doc)`
   (StarterKit w/ `undoRedo:false` + `Collaboration`, `src/extensions.ts`). Subpath export
   `@yapper/editor/derive` keeps the derivation path React/DOM-free for Bun (ADR-001).
2. `socket` authorization seam (`src/auth.ts`): `authorizeConnection` verifies the JWT then enforces
   owner-only (ADR-003). 4 unit tests (`src/auth.test.ts`): owner accepted; non-owner, missing note,
   bad token all rejected.
3. `socket` persistence (`src/persistence.ts`): `loadNoteOwner`, `loadDocState`, `saveDocState`
   (upsert full-state blob to `note_doc`, ADR-002).
4. `socket` derivation (`src/metadata.ts`): `saveDerivedMetadata` → `TiptapTransformer.fromYdoc` +
   `extractTitlePreview` → writes `note.title/preview/updated_at`.
5. `socket` server wiring (`src/index.ts`): `buildServer()` with `@hocuspocus/extension-database`
   (fetch/store), `onAuthenticate`, debounced `onStoreDocument`. Injectable `verifyToken`/`port`/
   `debounce` for tests; `listen()` only under `import.meta.main`.
6. `socket` DB-integration tests (`src/persistence.test.ts`, real Neon): owner lookup, state
   round-trip (save→load restores), null for unsaved, derived title/preview written.
7. `web`: `getAuthToken()` (`lib/api.ts`) fetches the Better Auth JWT; `Editor.tsx` opens a
   `HocuspocusProvider` (token refetched per (re)connect), binds TipTap to the Yjs doc, shows a
   connection badge; `/notes/[id]/page.tsx` mounts it in place of the slice-03 placeholder.

## In Progress
- Manual end-to-end verification (type/edit/reload, two same-owner tabs sync) — see Verification.
- PR + merge of `feat/editor-realtime`.

## Blocked
- (none)

## Next Steps
1. Run full test suite with `DATABASE_URL` set (socket persistence tests + api tests).
2. Manual smoke: edit a note, reload (content persists), open two tabs (sync); confirm dashboard
   title/preview update; confirm a non-owner/bad-token handshake is rejected.
3. Open PR; on merge flip ROADMAP + this file to `done`.

## Verification
- ✅ `bun run check-types` clean across all 7 packages.
- ✅ `bun run check` (biome) clean for slice-04 files (only pre-existing `architecture.html` warnings).
- ✅ Full suite green: editor (5), socket auth + DB-integration (8), api (5), db — all pass against
  real Neon. Covers goal states 2/3/4 (persist + reload-restore + derived title/preview) and 6 (auth).
- ✅ DB-free probe: `TiptapTransformer.fromYdoc` on a Yjs fragment → expected ProseMirror JSON →
  `extractTitlePreview` yields the right title/preview.
- ✅ Browser E2E (all 6 goal states, real OAuth login): created a note → editor showed "Connected" →
  typed H1 + bold + bullet list → reload restored the exact content → page H1 + dashboard
  title/preview updated to the derived "Realtime Test Note" → a second tab synced the content and
  picked up a live edit from the first tab with no reload. Only console noise was a hydration warning
  from a browser extension (`cz-shortcut-listen` on `<body>`), unrelated to app code.

## Session Notes
- TipTap resolved to v3.27 → StarterKit disables built-in history via `undoRedo:false`.
- Hocuspocus stays on the installed v2.15 line (server + extension-database + transformer + provider).
- `@hocuspocus/transformer.fromYdoc` needs no schema for the Y→JSON direction, so the socket never
  imports React/TipTap UI — only the pure `@yapper/editor/derive`.
- The local `.env` is policy-blocked from reading here; DB tests are run by the owner with
  `DATABASE_URL` set, matching the slice-03 api test workflow.
