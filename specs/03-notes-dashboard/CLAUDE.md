# CLAUDE.md — 03 · Notes & Dashboard

## Project Context
Metadata CRUD for notes + the owner's dashboard ("My Notes"). No content editing or sharing yet —
those are slices 04 and 06. The `/notes/:id` page is a shell the editor slots into later.

## Before Starting Work
1. Read `design.md`.
2. Ensure slice 02 (auth) is done — session middleware depends on it.
3. Check `implementation.md`.

## Code Patterns
- `requireAuth` middleware resolves Better Auth session → `req.userId`; reuse it on every notes route.
- Authorization this slice = `owner_id === req.userId`; keep it in one helper so slice 06 can swap it
  for `@yapper/permissions` cleanly.
- List queries select metadata columns only — never `note_doc.state`.
- web talks to `api` with a single credentialed fetch wrapper.

## Don't
- Don't add the TipTap editor or any Yjs here (slice 04).
- Don't add sharing, tokens, collaborators, or "Shared with me" (slice 06).
- Don't select the CRDT blob in list/get paths.
- Don't duplicate the auth/session logic — reuse the middleware from slice 02.
