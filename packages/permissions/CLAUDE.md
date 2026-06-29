# packages/permissions

`@yapper/permissions` is the single source of truth for "who can do what" with a note. It derives a user's effective permission (`none | view | edit`) from note ownership, the note-level access setting, and active-collaborator status, then layers a cache-first lookup (Redis in prod, optional/in-memory in dev and tests) on top. Both `api` route guards and `socket.onAuthenticate` import it so REST and realtime authorization never drift (ADR-001). It also exposes the Redis pub/sub channel helpers and publisher used to broadcast revoke and role-change events across socket instances.

## Tech Stack

- **ioredis** — Redis client for the permission cache (`buildRedisPermissionCache`) and event publisher (`buildRedisPublisher`); both read `REDIS_URL` and return `null` when it is unset.
- **drizzle-orm** + **@yapper/db** — db-backed loaders (`loadNote`, `isActiveCollaborator`) query the `note` and `noteCollaborator` tables.
- TypeScript (strict), Bun test runner. Pure ESM (`"type": "module"`).

## File Structure

- `src/index.ts` — package entry; re-exports the public API and provides the `defaultResolveDeps` / `buildResolveDeps` production wiring helpers.
- `src/derive.ts` — pure, synchronous permission derivation (`effectivePermission`) plus the `Permission` and `PermissionNote` types. Also re-exported at the `@yapper/permissions/derive` subpath.
- `src/resolve.ts` — async cache-first lookup (`resolvePermission`) and the cache-busting helpers; defines the injectable `ResolveDeps` contract.
- `src/loaders.ts` — default db-backed loaders (`loadNote`, `isActiveCollaborator`) that satisfy `ResolveDeps`.
- `src/cache.ts` — `PermissionCache` interface, `permCacheKey`, `PERM_TTL_SECONDS`, and the Redis cache factory.
- `src/events.ts` — Redis pub/sub channel name helpers and the `RedisPublisher` factory for revoke / role-change broadcasts.
- `src/derive.test.ts`, `src/resolve.test.ts` — Bun unit tests for the derivation rule and cache-first resolution.
- `package.json`, `tsconfig.json` — package manifest (exports `.` and `./derive`) and TS config extending `@yapper/typescript-config/node.json`.

## Exports

All from `@yapper/permissions` unless noted.

**Types**
- `Permission` — `"none" | "view" | "edit"`; a user's effective capability on a note. (Also from `@yapper/permissions/derive`.)
- `PermissionNote` — `{ ownerId: string; access: "private" | "view" | "edit" }`; minimal note shape the derivation needs.
- `PermissionCache` — minimal cache contract: `get`, `set`, `del`, `keys`.
- `ResolveDeps` — injectable deps for `resolvePermission`: `loadNote`, `isActiveCollaborator`, optional `cache`.
- `RedisPublisher` — `{ publish, quit }` interface for broadcasting events.

**Derivation**
- `effectivePermission(userId, note, isActiveCollaborator)` — pure rule: owner → `edit`; private note → `none`; non-active collaborator → `none`; else inherit note `access` (`view`/`edit`).

**Resolution (cache-first)**
- `resolvePermission(noteId, userId, deps)` — cache hit returns immediately; on miss loads note + collaborator flag, derives, writes back with a short TTL. Missing note → `none`.
- `bustUserPermission(cache, noteId, userId)` — invalidate one user's cached permission for a note. No-op without a cache.
- `bustNotePermissions(cache, noteId)` — invalidate every cached permission for a note (glob delete). No-op without a cache.

**Wiring helpers**
- `defaultResolveDeps(cache?)` — bundles the db-backed loaders with an optional cache into `ResolveDeps`.
- `buildResolveDeps()` — `defaultResolveDeps` with a freshly built Redis cache (cache is `null` when `REDIS_URL` is unset).

**Loaders**
- `loadNote(noteId)` — db loader returning `PermissionNote | null`.
- `isActiveCollaborator(noteId, userId)` — db loader returning whether the user has an `active` collaborator row.

**Cache primitives**
- `buildRedisPermissionCache()` — `PermissionCache` from `REDIS_URL`, or `null` when unset.
- `permCacheKey(noteId, userId)` — cache key `perm:{noteId}:{userId}`.
- `PERM_TTL_SECONDS` — `30`; TTL for cached permission entries.

**Events (Redis pub/sub)**
- `revokeChannel(noteId)` — channel name `revoke:{noteId}`.
- `roleChangeChannel(noteId)` — channel name `role-change:{noteId}`.
- `buildRedisPublisher()` — `RedisPublisher` from `REDIS_URL`, or `null` when unset (separate client, since a subscriber-mode connection cannot also publish).

## When to Use

Import this package whenever `api` or `socket` must decide what a user may do with a note — never re-implement the rule locally.

- **Guarding a REST route or socket connect** — build deps once at startup and reuse them:
  ```ts
  const deps = buildResolveDeps(); // or defaultResolveDeps(cache)
  const perm = await resolvePermission(noteId, userId, deps);
  if (perm === "none") reject(); // socket: deny; api: 403
  // perm === "view" → read-only; perm === "edit" → can edit
  ```
  Using the shared `resolvePermission` is what keeps REST and realtime decisions identical (ADR-001).

- **Pure derivation when you already hold the inputs** — if you've loaded the note and collaborator flag yourself, call `effectivePermission(userId, note, isActive)` directly (sync, db-free; ideal for tests and tight loops).

- **Invalidating the cache on a state change** — the cache TTL is short, but mutations should bust eagerly so changes take effect immediately:
  - Collaborator joins / a single user's status changes → `bustUserPermission(cache, noteId, userId)`.
  - Owner changes the note's access level (`private`/`view`/`edit`) or revokes/makes private → `bustNotePermissions(cache, noteId)` to clear every user's entry.

- **Broadcasting realtime auth changes across instances** — when the owner makes a note private (revoke) or changes its access level, `api` publishes to the matching channel so all `socket` instances can disconnect/downgrade affected users:
  ```ts
  await publisher.publish(revokeChannel(noteId), payload);     // make-private / revoke
  await publisher.publish(roleChangeChannel(noteId), payload); // view ↔ edit change
  ```
