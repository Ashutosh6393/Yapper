# 03 · Notes & Dashboard — Implementation

## Status: done

## Completed
1. `requireAuth` middleware (`apps/api/src/auth/requireAuth.ts`) — injectable `SessionResolver`
   (default validates the Better Auth cookie via `auth.api.getSession` + `fromNodeHeaders`);
   sets `req.userId` or responds 401.
2. `createApp` factory (`apps/api/src/app.ts`) so routes can be mounted in-process for tests
   with a fake resolver; `index.ts` now just calls `createApp().listen()`.
3. Notes CRUD router (`apps/api/src/notes/router.ts`): `POST` (Untitled/private defaults),
   `GET` list (metadata only, newest first), `GET/:id` + `DELETE/:id` with owner-only guard
   (404 absent / 403 non-owner). Owner check isolated in `ownsNote` for the slice-06 swap (ADR-001).
4. API tests (`apps/api/src/notes/router.test.ts`, supertest + Neon): unauth→401; create→list;
   list is metadata-only & scoped to caller; get/delete 403/404; delete cascades `note_doc`. 5 pass.
5. web: credentialed fetch wrapper (`apps/web/lib/api.ts`), dashboard "My Notes" list + create +
   empty state, `/notes/[id]` gated shell (title + placeholder + owner delete).

## In Progress
- (none)

## Blocked
- (none)

## Next Steps
- (none) — `feat/notes-dashboard` merged (PR #6); slice `done`.

## Verification
- ✅ Manual smoke test (real OAuth login → create → delete) confirmed working by the owner.
- ✅ Automated API tests (5) + `bun run check-types` green. `biome check` to be confirmed in CI.

## Session Notes
- `apps/api` gained `drizzle-orm`, `supertest`, `@types/supertest`, `@types/bun` deps + a `test` script.
- Routes are testable without OAuth via `createApp({ resolveSession })`; production uses the default
  Better Auth resolver, so the test header path is never wired in prod.
- `biome check` could not be run locally (OS Application Control policy blocks the cached binary);
  type-check is clean and formatting follows repo conventions — confirm `biome check` in CI.
