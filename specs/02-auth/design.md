# 02 · Auth — Design

## Goal State (acceptance)
1. From `web`, a user logs in with **Google** or **GitHub**; a session is established.
2. `/dashboard` (web) is gated: logged-out → redirected to `/login`; logged-in → renders.
3. Better Auth tables (`user`, `session`, `account`, `verification`) exist in Postgres; FK constraints
   from slice 01's tables to `user` are added.
4. `api` exposes Better Auth at `/api/auth/*`; web's Better Auth React client talks to it (CORS + credentials).
5. JWT plugin: web can fetch a short-lived JWT; `api` JWKS endpoint serves keys; `@yapper/auth` exports
   `verifyJwt(token)` that validates against JWKS and returns `{ userId }`. A unit test proves verify works.

## Scope
**In:** `packages/auth` (Better Auth instance config, social providers, Drizzle adapter, JWT plugin,
`verifyJwt` helper), mounting in `api`, web login/logout UI + session access + gated `/dashboard`,
FK constraints migration.
**Out:** Notes, dashboard content (03). `/dashboard` is just an authenticated placeholder here.

## Design
- **`packages/auth`** defines `auth = betterAuth({...})`: Drizzle adapter over `@yapper/db`, providers
  Google + GitHub (client id/secret from env), `jwt()` plugin (exposes JWKS + token issuance),
  trustedOrigins = web origin. Exports `auth`, `auth.handler`, and `verifyJwt(token): Promise<{userId}>`
  (verifies RS256 against the api JWKS URL, cached JWKS).
- **`api`** mounts `app.all("/api/auth/*", toNodeHandler(auth))` and configures CORS for the web origin
  with `credentials: true`. Better Auth manages the session cookie.
- **`web`** uses `createAuthClient` (`better-auth/react`) with `baseURL` = api. `/login` page with
  "Continue with Google/GitHub" buttons → `signIn.social({ provider })`. A server-side guard (middleware
  or layout) checks session for `/dashboard`; `/logout` calls `signOut`.
- **JWT for socket (used in slice 04+):** web fetches a JWT via the plugin to pass as the Hocuspocus
  `token`. Only the verify helper + JWKS are needed now; socket consumes them later.

## Deliverables
```
packages/auth/  package.json, src/auth.ts (betterAuth config), src/verify.ts (verifyJwt), src/index.ts, tsconfig.json
apps/api/       mount /api/auth/*, CORS config, env (GOOGLE_*, GITHUB_*, BETTER_AUTH_SECRET, WEB_ORIGIN)
apps/web/       lib/auth-client.ts, app/login/page.tsx, app/dashboard/page.tsx (gated placeholder), middleware/guard, sign-out
packages/db/    drizzle: add Better Auth tables (via better-auth CLI/schema) + FK constraints migration
```

## Implementation tasks
1. `packages/auth` Better Auth instance (providers + Drizzle adapter + jwt plugin) → verify config type-checks.
2. Generate Better Auth tables into `@yapper/db` schema + migrate; add FK constraints (note.owner_id, note_collaborator.user_id → user.id) → verify tables + FKs exist.
3. Mount handler + CORS in `api` → verify `GET /api/auth/ok` (or session route) reachable from web origin.
4. web `auth-client` + `/login` with Google/GitHub buttons → verify OAuth round-trip creates a `user` row.
5. Gate `/dashboard`; add `/logout` → verify redirect when logged out, render when logged in.
6. `verifyJwt` + JWKS → verify unit test: issue token (test util) → verify returns correct `userId`; tampered token rejected.

## Test plan
- Unit: `verifyJwt` accepts a valid JWT, rejects expired/tampered/wrong-issuer.
- Manual: full Google + GitHub login, session persists across reload, logout clears it, `/dashboard` gate works.

## Risks / notes
- OAuth callback URLs must be registered for `localhost` in Google/GitHub apps; document in `.env.example`.
- CORS + cookies cross-origin (web:3000 ↔ api:4000): set `credentials`, correct `sameSite`/`secure` for dev (http).
- Keep `BETTER_AUTH_SECRET` and provider secrets out of git (`.env` only).
- Better Auth Drizzle adapter table names must match generated schema; run its CLI/generator, don't hand-write.
