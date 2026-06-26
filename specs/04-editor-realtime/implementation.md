# 04 · Editor & Realtime (single-user) — Implementation

## Status: not-started

## Completed

## In Progress

## Blocked
- Requires slices 01–03.

## Next Steps
1. `packages/editor` extensions + pure `extractTitlePreview` (+ unit test).
2. `socket` Hocuspocus boot + `onAuthenticate` (verifyJwt + owner-only).
3. `extension-database` fetch/store against `note_doc`.
4. Debounced `onStoreDocument` → derive + write `note.title/preview/updated_at`.
5. web editor wiring + JWT handshake.

## Session Notes
