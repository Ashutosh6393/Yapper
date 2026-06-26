# 06 · Sharing & Permissions — Implementation

## Status: not-started

## Completed

## In Progress

## Blocked
- Requires slices 04 + 05.

## Next Steps
1. `@yapper/permissions` derivation + Redis cache helpers (+ unit tests).
2. `api` `POST /notes/:id/share` (owner; set access + mint token; bust cache).
3. `api` `GET /share/:token` + `POST /share/:token/join` (upsert collaborator).
4. `api` `GET /notes/shared` ("Shared with me").
5. `socket.onAuthenticate` → shared derivation + read-only for viewers.
6. web share dialog + `/share/:token` join page + "Shared with me" section.

## Session Notes
