# CLAUDE.md — 04 · Editor & Realtime (single-user)

## Project Context
Wire TipTap + Yjs + Hocuspocus so the owner can edit a note with server-side persistence and derived
title/preview. Single instance, owner-only, no cursors/sharing yet (those are 05/06).

## Before Starting Work
1. Read `design.md`.
2. Ensure slices 01–03 done (db, auth/JWT, note CRUD + `/notes/:id` shell).
3. Confirm `verifyJwt` + JWKS from slice 02 work.
4. Check `implementation.md`.

## Code Patterns
- `@yapper/editor` holds the canonical TipTap schema + a **pure** `extractTitlePreview` usable in Bun
  (no React/DOM in that path) so `socket` can derive metadata server-side.
- `socket` uses `@hocuspocus/extension-database` (`fetch`/`store`) against `note_doc`; `documentName` = note id.
- `onAuthenticate` always `verifyJwt` first; owner-only check this slice (swap to `@yapper/permissions` in 06).
- web connects via `HocuspocusProvider` with a freshly fetched JWT; bind TipTap `Collaboration` to its doc.

## Don't
- Don't add Redis/`extension-redis` or awareness/cursors (slice 05).
- Don't add sharing, tokens, view/edit, or read-only connections (slice 06).
- Don't import React into the server-side schema/derivation path.
- Don't trust client-supplied identity; `userId` comes from the verified JWT.
