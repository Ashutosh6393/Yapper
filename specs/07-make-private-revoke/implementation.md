# 07 · Make Private & Revoke — Implementation

## Status: done

## Completed
1. `packages/permissions/src/events.ts` — Redis channel helpers + `buildRedisPublisher()`.
2. `api` `POST /api/notes/:id/private` — transaction (access, token null, revoke collaborators, bust cache) + `PUBLISH revoke:{noteId}`.
3. `api` `POST /api/notes/:id/share` — now also publishes `role-change:{noteId}` on level change.
4. `socket` `auth.ts` — `isOwner` in `ConnectionContext`, `loadNote` in `AuthorizeDeps`.
5. `socket` `revoke.ts` — Redis subscriber; `kickNonOwners` closes non-owner connections; stateless kick for `note_made_private`.
6. `socket` `index.ts` — revoke subscriber wired; `loadNote` passed to `authorizeConnection`.
7. `web` — `makePrivate` API method; Editor handles `note_made_private` kick; ShareDialog "Make Private" button; page routes collaborator out on kick.

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
