# 04 · Editor & Realtime (single-user) — Design

## Goal State (acceptance)
1. Opening `/notes/:id` (as owner) loads a **TipTap** rich-text editor bound to a **Yjs** doc via
   `@hocuspocus/provider`, connected to the `socket` app.
2. Typing rich text (headings, bold, lists) syncs to the server; on first edit a `note_doc` row is created.
3. `socket` persists Yjs state to `note_doc` (debounced ~2s) and derives **title + preview** from the doc,
   writing them + `updated_at` onto `note`.
4. Reloading the page restores the exact content from the server.
5. Two tabs of the **same owner** on the same note stay in sync in real time (single socket instance).
6. The socket handshake is authenticated: a connection with no/invalid JWT is rejected; non-owner rejected
   (full sharing/permissions arrive in 06 — here only the owner may connect).

> No cross-instance fanout (Redis) and no other-user cursors yet — those are slice 05. No sharing — 06.

## Scope
**In:** `packages/editor` (shared TipTap schema/extensions + `extractTitlePreview(doc)`), `socket` app
Hocuspocus server with `onAuthenticate` (JWT verify + owner check), `@hocuspocus/extension-database`
persistence to `note_doc`, debounced `onStoreDocument` writing derived metadata; `web` editor wiring +
JWT fetch for the handshake.
**Out:** Redis fanout + awareness/cursors (05), sharing + view/edit + read-only enforcement (06).

## Design
- **`packages/editor`**: exports the TipTap `extensions` array (StarterKit subset + Collaboration) and a
  pure `extractTitlePreview(ydoc | prosemirrorJSON) -> { title, preview, text }` used by both `web`
  (config) and `socket` (server-side derivation). Single source of editor schema → server can parse the doc.
- **`socket`** (Hocuspocus):
  - `onAuthenticate({ token, documentName })`: `verifyJwt(token)` → `userId`; load note; **owner-only**
    this slice (`note.owner_id === userId`) else reject. `documentName` = note id.
  - `extension-database`: `fetch(documentName)` → `note_doc.state` (or empty for new); `store(documentName, state)`
    → upsert `note_doc.state` + `updated_at`.
  - `onStoreDocument` (debounced ~2s, max-wait): also derive `{title,preview}` via `@yapper/editor` and
    update the `note` row.
- **`web`**: editor component uses `HocuspocusProvider({ url: socketUrl, name: noteId, token: <jwt> })`
  + `Collaboration` extension bound to the provider's `Y.Doc`. Fetch JWT from Better Auth before connecting;
  show connection status. Replaces the slice-03 placeholder on `/notes/:id`.

## Implementation tasks
1. `packages/editor` extensions + `extractTitlePreview` (pure) → unit test derivation from a sample doc.
2. `socket` Hocuspocus server boot + `onAuthenticate` (verifyJwt + owner check) → reject unauth/non-owner.
3. `extension-database` fetch/store against `note_doc` → verify state persists + reload restores.
4. `onStoreDocument` debounce → derive + write `note.title/preview/updated_at` → verify dashboard updates.
5. web editor wiring + JWT handshake → verify type/edit/reload + two same-owner tabs sync.

## Test plan
- Unit: `extractTitlePreview` (empty → "Untitled"; first heading/line → title; preview excerpt).
- Integration: connect with valid owner JWT, apply an update, assert `note_doc` row + derived title.
- Manual: edit, reload (persists), two tabs sync; bad token rejected.

## Risks / notes
- Server-side parsing of the Yjs doc requires the shared schema — keep `@yapper/editor` framework-agnostic
  enough to run under Bun in `socket` (no React imports in the schema/derivation path).
- Debounce: balance data-loss window vs write volume (~2s + max-wait). Flush on last disconnect.
- JWT TTL must exceed reconnect cadence or the provider must refresh the token on reconnect.
