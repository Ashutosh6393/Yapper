# 06 · Sharing & Permissions — Implementation

## Status: in-progress

## Completed
1. `@yapper/permissions` package: pure `effectivePermission` derivation (unit-tested across the
   owner/private/view/edit × collaborator table), cache-first `resolvePermission`, Redis cache helpers
   (`permCacheKey`, `buildRedisPermissionCache`, `bustUserPermission`, `bustNotePermissions`), and
   db-backed loaders. 10 unit tests.
2. `api` `POST /notes/:id/share` (owner-only; sets access, mints token if absent, busts note cache);
   `GET /share/:token` + `POST /share/:token/join` (upsert active collaborator, busts user cache);
   `GET /notes/shared` ("Shared with me"); `GET /notes/:id` now collaborator-aware + returns `isOwner`.
   8 supertest cases (+ existing 5 still green).
3. `socket.onAuthenticate` switched to the shared derivation: `none` rejects, `view` →
   `connection.readOnly = true` (server drops inbound updates), `edit`/owner read-write; `permission`
   pushed to the client via the identity stateless message. Integration test proves a viewer's
   inbound edits are dropped server-side while an editor's persist.
4. web: dashboard "Shared with me" section; owner-only `ShareDialog` (pick view/edit, copy link);
   `/share/:token` join page (login-return flow); login `?returnTo=` support; editor `editable`
   driven by the server-pushed permission + "View only" tag.

## In Progress
- Awaiting review/merge. Verified locally: `bun run check-types` (7/7), web `next build`, and the
  db/permissions/api/socket test suites all green.

## Blocked
- None.

## Next Steps
- Open PR(s) for the slice. Make-private/revoke + token rotation + live disconnect is slice 07.

## Session Notes
- Hocuspocus is v2.15.3 here: the read-only flag is `onAuthenticate`'s `connection.readOnly`
  (the `connectionConfig` name is v3/v4). 
- Permission cache is optional: with no `REDIS_URL` (tests), `resolvePermission` recomputes from the
  db every call and busting is a no-op — always correct, just no fast path.
- Removed the now-unused `loadNoteOwner` from `socket/persistence` (superseded by `@yapper/permissions`).
