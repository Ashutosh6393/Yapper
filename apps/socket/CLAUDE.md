# apps/socket

The Yjs WebSocket backend for Yapper. A Bun + Hocuspocus server that hosts the CRDT (Yjs) documents behind every collaborative note. It authorizes each WebSocket handshake statelessly (verifies the Better Auth JWT via JWKS, then derives the user's effective permission with `@yapper/permissions`), persists the full Yjs doc state to Postgres, derives `note.title/preview` on save, stamps server-authoritative awareness identity (anti-spoof), fans out doc updates + awareness across instances via Redis, and instantly disconnects non-owner clients when a note is made private or a collaborator's role changes.

## Tech Stack

- **Runtime**: Bun (ESM, `"type": "module"`)
- **WebSocket / CRDT**: `@hocuspocus/server` ^2.15.2 (Yjs over WebSocket), `yjs` ^13.6.31
- **Hocuspocus extensions**: `@hocuspocus/extension-database` ^2 (load/store doc state), `@hocuspocus/extension-redis` ^2.15.2 (cross-instance fanout), `@hocuspocus/transformer` ^2 (`TiptapTransformer`, Y.Doc → ProseMirror JSON server-side)
- **Redis client**: `ioredis` ^5.4.1 (revoke/role-change pub/sub subscriber; also backs the redis extension)
- **DB**: `drizzle-orm` ^0.44.2 via the shared `@yapper/db` client/schema (Postgres)
- **Shared workspace packages**: `@yapper/auth` (JWKS JWT verify), `@yapper/permissions` (effective-permission derivation, cache helpers, revoke/role channels), `@yapper/editor` (shared schema + `extractTitlePreview` derivation), `@yapper/schemas` (Zod schemas for the handshake context + client→server message payloads) *(adopted in spec 09b)*
- **Language/Tooling**: TypeScript 5.9.2 (strict, extends `@yapper/typescript-config/node.json`), Biome (repo-root config), Vitest/`bun:test` for tests
- **Dev dep**: `@hocuspocus/provider` ^2 (client used in integration tests)

## File Structure

```
apps/socket/
├── src/
│   ├── index.ts        # buildServer(): wires Hocuspocus — Database + redis extensions,
│   │                   #   onAuthenticate, connected (identity push), onStoreDocument,
│   │                   #   revoke subscriber + destroy cleanup. Boots only when run directly.
│   ├── auth.ts         # authorizeConnection(): verify JWT → resolve permission + load owner.
│   │                   #   ConnectionContext / AuthorizeResult / AuthorizeDeps types.
│   ├── identity.ts     # Server-authoritative awareness identity; colorFromUserId (FNV-1a → hue).
│   ├── persistence.ts  # loadDocState / saveDocState: full Yjs state blob upsert into note_doc.
│   ├── metadata.ts     # saveDerivedMetadata(): Y.Doc → title/preview → update note row.
│   ├── redis.ts        # buildRedisExtension(): REDIS_PREFIX="yapper", null when REDIS_URL unset.
│   ├── revoke.ts       # kickNonOwners() + setupRevokeSubscriber(): psubscribe revoke/role channels.
│   └── *.test.ts       # auth, awareness, identity, persistence, readonly, realtime, revoke tests
├── test-setup.ts       # Preloaded by bunfig; deletes REDIS_URL, drains @yapper/db pool once.
├── bunfig.toml         # [test] preload = test-setup.ts
├── tsconfig.json       # extends @yapper/typescript-config/node.json, include: src
├── .env / .env.example # SOCKET_PORT, DATABASE_URL, REDIS_URL, BETTER_AUTH_URL (JWKS issuer/host)
└── package.json
```

## Commands

Run from `apps/socket/` (Bun loads `.env` from the cwd). Use `bun run <script>`:

- `bun run dev` — `bun run --watch src/index.ts`, hot-reloading dev server.
- `bun run start` — `bun run src/index.ts`, run once (production-style boot).
- `bun run check-types` — `tsc --noEmit`, strict type check.
- `bun test` — run the `*.test.ts` suite (no script alias; `bunfig.toml` preloads `test-setup.ts`).

Notes:
- `DATABASE_URL` is a remote **Neon** Postgres; `REDIS_URL` is a remote **Upstash** Redis (no local Docker). Tests delete `REDIS_URL` so they run single-instance without Redis.
- From the monorepo root use Turbo (`turbo dev`, `turbo check-types`); db-dependent commands must run from this dir so `.env` is found.

## Conventions / Notes

- **Stateless handshake auth (JWKS)**: `onAuthenticate` calls `authorizeConnection`, which verifies the JWT via `@yapper/auth`'s `verifyJwt` (JWKS, no DB session lookup), then resolves the user's effective permission. Never trust client-supplied identity — `userId`/`name` come only from the verified token.
- **Permission gating (ADR-001)**: Permission is derived with the same cache-first `@yapper/permissions` rule the REST `api` uses, so realtime and REST never disagree. `none` → reject the connection; `view` → read-only; `edit`/owner → read/write.
- **Read-only viewers (ADR-003)**: Viewers get `connection.readOnly = true`; the server drops their inbound doc updates while still streaming out updates + awareness. Client `editable:false` is UX only — the server is authoritative.
- **Server-authoritative identity (ADR-002)**: `connected` pushes a stateless `{ type: "identity", user, permission }` payload built from the verified JWT. Clients render their own awareness label from this and only broadcast cursor *geometry*; `color` is a deterministic FNV-1a hash of `userId`.
- **Persistence**: One full-state Yjs blob per note in `note_doc` (`Y.encodeStateAsUpdate`), upserted on each debounced `onStoreDocument` (~2s default; `debounce`/`maxDebounce` injectable). `onStoreDocument` also derives `note.title/preview/updated_at` via `@hocuspocus/transformer` + `@yapper/editor` (no React/DOM on this path).
- **Redis fanout**: Wired only when `REDIS_URL` is set, under prefix `yapper`. Multiple instances sharing one Redis stay in sync (doc updates + awareness). Single-instance dev and all tests run without Redis.
- **Instant disconnect on private / role change**: `setupRevokeSubscriber` psubscribes the `revoke:{noteId}` and `role-change:{noteId}` channels (`@yapper/permissions`). `kickNonOwners` closes every non-owner connection on the doc — owners are never kicked. `note_made_private` sends a stateless `{ type: "kick", reason: "note_made_private" }` first (so the client shows the message and does not reconnect); `role_change` closes silently so the client reconnects and re-authorizes.
- **Validate inbound payloads with Zod (`@yapper/schemas`, ADR 09b)**: parse anything the client controls — the handshake `context`/auth payload and any client→server message — against the shared schema before trusting it; reject the connection/message on failure. The server-authoritative identity push and `kick`/`identity`/`permission` message *shapes* are defined once in `@yapper/schemas` and reused by the `web` client, so both ends agree. This complements (does not replace) the JWT/permission checks.
- **Testability**: `buildServer(options)` is kept separate from `listen()` so tests boot it in-process with injected `verifyToken`/`resolvePermission`/`loadNote`. The module starts listening only under `import.meta.main`.
- **TypeScript**: strict; do **not** use `as any`. Context is read via typed casts to `ConnectionContext`.
- **Biome** handles lint/format (repo-root `biome.json`); do not add Prettier.
