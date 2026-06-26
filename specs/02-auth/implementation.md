# 02 · Auth — Implementation

## Status: done

Implementation complete and **all acceptance criteria verified end-to-end**, including a live Google
OAuth round-trip in the browser (2026-06-26). GitHub is wired identically and its authorize URL is
config-verified, but a full GitHub round-trip was not performed (Google satisfies acceptance #1).

## Completed
- **`packages/auth`** — Better Auth instance (`src/auth.ts`): Drizzle adapter over `@yapper/db`,
  Google + GitHub social providers (env creds), `jwt()` plugin, `trustedOrigins = [WEB_ORIGIN]`,
  `advanced.database.generateId: false` so Postgres assigns `uuid` ids. Type-checks clean.
- **`verifyJwt`** (`src/verify.ts`) — verifies a Better Auth JWT against the JWKS and returns
  `{ userId }` (the `sub`). Algorithm-agnostic (resolves key by `kid`); injectable JWKS/issuer seam
  for offline testing. Unit test: 5 cases pass (valid → userId; tampered, expired, wrong-issuer,
  unknown-key → reject). Tests use EdDSA/Ed25519 to match what Better Auth actually issues.
- **`@yapper/db`** — added Better Auth tables (`user`, `session`, `account`, `verification`, `jwks`)
  as `uuid`-keyed tables; added FK constraints `note.owner_id → user.id` and
  `note_collaborator.user_id → user.id` (both `ON DELETE CASCADE`). Migration `0001_mixed_starfox`
  generated and **applied to Neon**; tables + FKs verified present. `schema.test.ts` updated to seed a
  real `user` first (FK now enforced).
- **`api`** — mounts `app.all("/api/auth/*", toNodeHandler(auth))` before `express.json()`; CORS for
  `WEB_ORIGIN` with `credentials: true`. Verified live: `GET /api/auth/ok` → `{"ok":true}` with
  `Access-Control-Allow-Origin` + `Access-Control-Allow-Credentials`; `GET /api/auth/jwks` serves a
  key; `GET /api/auth/get-session` → `null` when logged out; `GET /health` → 200.
- **`web`** — `lib/auth-client.ts` (`createAuthClient`, baseURL = api, credentialed); `/login` with
  Google/GitHub buttons (`signIn.social`); `/dashboard` gated client-side via `useSession` (redirects
  to `/login` when logged out); sign-out via `signOut`.
- **Env** — `apps/api/.env.example` documents `BETTER_AUTH_URL`, `BETTER_AUTH_SECRET`, and the
  `GOOGLE_*` / `GITHUB_*` creds with their OAuth callback URLs.

## Quality gate
- `bun run check-types` — clean (6 packages).
- `bun run check` (biome) — clean.
- `bun run test` — 6 pass (5 auth + 1 db).

## End-to-end verification (2026-06-26, live Google OAuth)
Driven via browser against `bun run dev` (web :3000, api :4000), DB = Neon.
- Login: `/login` → "Continue with Google" → Google consent → redirected to `/dashboard` showing
  "Signed in as vashutosh625@gmail.com".
- DB after login: `user`=1 (`vashutosh625@gmail.com`, name "Ashutosh Verma", `email_verified=true`,
  id is a real **uuid** → `generateId:false` works), `account`=1 (`provider=google`, `user_id` = the
  user's uuid → FK holds), `session`=1.
- Session persists across a `/dashboard` reload (after the documented `isPending` flash, ADR-005).
- Sign-out → redirected to `/login`; DB: `session`=0 while `user`/`account` remain 1/1.
- Gate: logged-out direct nav to `/dashboard` → redirected to `/login`.

## Blocked
- None.

## Next Steps
- Slice 03 (notes-dashboard) can build on this. Optional follow-up: run a full GitHub round-trip.

## Session Notes
- Better Auth 1.6.21; jose 5.10. JWT plugin signs **EdDSA/Ed25519** by default (ADR-002 assumed
  RS256) — `verifyJwt` is algorithm-agnostic, so it handles the real tokens (see ADR-004).
- DB is Neon (no local Docker); migration applied there.
- `apps/api/.env` is created locally for boot; it's gitignored — never committed.
