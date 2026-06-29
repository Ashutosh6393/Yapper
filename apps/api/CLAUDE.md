# apps/api

The `@yapper/api` app is the HTTP backend for Yapper. It runs Bun + Express, hosts the Better Auth handler under `/api/auth/*` (Google/GitHub OAuth, session, JWKS, token), and exposes the notes and sharing REST API. It owns note metadata and collaborator records in Postgres (via Drizzle), derives effective permissions through the shared `@yapper/permissions` package (cache-backed by Redis), and publishes revoke / role-change events to the `socket` instances over Redis pub/sub. It never serves the CRDT document blob — that is the socket app's job.

## Tech Stack

- **Runtime**: Bun (ESM, `"type": "module"`)
- **HTTP**: Express `^4.21` + `cors` `^2.8`
- **Auth**: `better-auth` `^1.3` — mounted via `toNodeHandler` / `fromNodeHeaders` from `better-auth/node`; config lives in the shared `@yapper/auth` package
- **DB**: `@yapper/db` (Drizzle ORM `^0.44`, Postgres) — schema + client are in the shared package, NOT here
- **Permissions / pub-sub**: `@yapper/permissions` — effective-permission derivation, Redis permission cache, and Redis publisher
- **Validation**: `@yapper/schemas` (Zod) — request bodies / params are parsed against shared schemas at the route boundary; response shapes reuse the same contract types *(adopted in spec 09b)*
- **Language**: TypeScript `5.9.2`, strict (extends `@yapper/typescript-config/node.json`)
- **Tests**: `bun test` (Bun's built-in runner) + `supertest` for HTTP-level route tests
- **Lint/format**: Biome (configured at repo root)

## File Structure

```
apps/api/
├── src/
│   ├── index.ts            # Entry point: createApp() + app.listen(API_PORT ?? 4000)
│   ├── app.ts              # createApp()/buildApp() factory; mounts auth, /health, notes, share routers
│   ├── types.d.ts          # Global Express.Request augmentation: adds req.userId
│   ├── permissions.ts      # api wiring of @yapper/permissions: resolvePerm() + shared permCache
│   ├── redis.ts            # Singleton redisPublisher (null when REDIS_URL unset)
│   ├── auth/
│   │   └── requireAuth.ts  # SessionResolver type + requireAuth middleware (sets req.userId or 401)
│   ├── notes/
│   │   ├── router.ts       # /api/notes CRUD, share, private, delete (owner-gated mutations)
│   │   ├── router.test.ts  # notes route tests (supertest)
│   │   └── private.test.ts # make-private / revoke flow tests
│   └── share/
│       └── router.ts       # /api/share capability-link lookup + join
│   └── sharing.test.ts     # share/join flow tests
├── test-setup.ts           # Preloaded by bunfig.toml; drains shared @yapper/db pool once after run
├── bunfig.toml             # [test] preload = test-setup.ts
├── .env.example            # Env var reference (see below)
├── tsconfig.json           # extends @yapper/typescript-config/node.json, includes src
└── package.json
```

### Routes

- **`/api/auth/*`** — handled entirely by Better Auth (`toNodeHandler(auth)`). Mounted *before* `express.json()` so it can read the raw body. Owns session, OAuth callbacks, JWKS, and JWT token issuance (the socket app verifies handshakes statelessly via JWKS).
- **`GET /health`** — liveness probe.
- **`/api/notes`** (`notesRouter`, all routes behind `requireAuth`):
  - `POST /` — create an owned note (defaults Untitled / private), returns metadata.
  - `GET /` — list caller's owned notes, newest first (metadata only).
  - `GET /shared` — "Shared with me": active-collaborator notes that are still non-private. Registered *before* `/:id`.
  - `GET /:id` — note metadata if caller has view/edit (`resolvePerm`); 404 absent, 403 no perm. Returns `isOwner` without leaking `ownerId`.
  - `POST /:id/share` — owner only: set access `view|edit`, mint `shareToken` if absent, bust perm cache, publish `roleChange`, return capability URL.
  - `POST /:id/private` — owner only: transactionally set access=private + clear token + revoke collaborators, bust cache, publish `revoke`.
  - `DELETE /:id` — owner only (cascades to note_doc / note_collaborator via FKs).
- **`/api/share`** (`shareRouter`, all routes behind `requireAuth`):
  - `GET /:token` — note summary for the join page; 404 if token unknown or note private.
  - `POST /:token/join` — upsert caller as active collaborator (owner needs no row), bust that user's cached permission.

## Commands

Run from `apps/api` (Bun loads `.env` from the cwd; running DB-touching tests from the repo root fails with "DATABASE_URL is not set"). All scripts come from `package.json`:

- `bun run dev` — `bun run --watch src/index.ts` (hot reload).
- `bun run start` — `bun run src/index.ts`.
- `bun run build` — `bun build src/index.ts --target bun --outdir dist`.
- `bun test` — Bun test runner; `bunfig.toml` preloads `test-setup.ts` to drain the shared DB pool once after the full run. Tests hit a real Postgres (Neon) and exercise routes via supertest, injecting a fake `SessionResolver` (the `x-test-user-id` header) instead of a real OAuth cookie.
- `bun run check-types` — `tsc --noEmit`.

Monorepo-wide equivalents (`turbo dev`, `turbo test`, etc.) run from the repo root.

### Environment variables (see `.env.example`)

`API_PORT` (default 4000), `WEB_ORIGIN` (default `http://localhost:3000`; used for CORS + share-link origin), `DATABASE_URL`, `REDIS_URL` (optional — publisher/cache become no-ops/null when unset), `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`, `GITHUB_CLIENT_ID/SECRET`.

## Conventions / Notes

- **Auth resolution**: every gated router does `router.use(requireAuth(resolve))`, which sets `req.userId` or replies 401. Routes then use the local `authed()` wrapper to receive `userId` as a non-nullable string and forward async rejections to Express. `createApp({ resolveSession })` / `buildApp({ skipAuth })` let tests swap in a fake resolver — do not bypass auth any other way.
- **Drizzle, not Prisma**: all DB access is Drizzle query builder against `@yapper/db` (`db`, `note`, `noteCollaborator`, `noteDoc`, `user`). Define schema in the `@yapper/db` package, not here.
- **Never expose `credential.key`** (or any auth credential columns) in a query. Note routes select explicit metadata columns only and never return the CRDT blob (`note_doc`); `GET /:id` also strips `ownerId`, returning a derived `isOwner` flag instead.
- **Permission derivation is shared (ADR-001)**: gate reads with `resolvePerm(noteId, userId)` from `src/permissions.ts` — the same cache-first decision the socket app makes. After any access/collaborator mutation, bust the cache (`bustNotePermissions` / `bustUserPermission` with `permCache`).
- **Cross-app events**: access changes publish to Redis channels (`roleChangeChannel`, `revokeChannel`) via `redisPublisher` so socket instances disconnect/refresh affected clients. Code must tolerate `redisPublisher` being `null` (optional chaining) when `REDIS_URL` is unset.
- **Capability links (ADR-002)**: share tokens are random URL-safe bearer tokens (`randomBytes(24).base64url`). Possession + a valid login grants access; opening a share link still mandates auth. Private notes are excluded from all token lookups.
- **Better Auth mount order**: keep `app.all("/api/auth/*", toNodeHandler(auth))` above `express.json()` — the handler reads the raw body itself.
- **Validate at the boundary with Zod (`@yapper/schemas`, ADR 09b)**: parse `req.body`/`req.params` with the shared schema for that route before touching the DB; on failure return `400` with the Zod issues. Import request/response **types** from `@yapper/schemas` (`z.infer`) instead of declaring local shapes — the same schema the `web` client validates against. Never hand-roll a body shape that already has a contract.
- **Strict TS**: no `as any`. Prefer narrow types and the existing `authed()` pattern over casting.
- Keep diffs small and match existing style (Biome-formatted).
```
