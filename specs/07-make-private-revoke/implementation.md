# 07 · Make Private & Revoke — Implementation

## Status: not-started

## Completed

## In Progress

## Blocked
- Requires slice 06.

## Next Steps
1. `api` `POST /api/notes/:id/private` (transaction + `PUBLISH revoke:{noteId}`).
2. `socket` subscribe to `revoke:{noteId}` → close non-owner connections with reason.
3. web disconnect handler → "note made private by owner" + route out (owner stays).
4. Re-share mints a new token (old link dead).
5. `role-change` reconnect for edit→view while connected.

## Session Notes
