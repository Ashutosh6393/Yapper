# CLAUDE.md — 02 · Auth

## Project Context
Better Auth in `packages/auth`, mounted by `api`, consumed by `web`. Google + GitHub OAuth, Drizzle
adapter over `@yapper/db`, JWT plugin so `socket` can later verify the WS handshake statelessly via JWKS.

## Before Starting Work
1. Read `design.md`.
2. Ensure slices 00 + 01 are done (apps boot, `@yapper/db` migrates).
3. Have Google + GitHub OAuth app credentials (or document placeholders in `.env.example`).
4. Check `implementation.md`.

## Code Patterns
- Single source of auth config in `packages/auth/src/auth.ts`; `api` only mounts the handler.
- web session access via Better Auth React client / server helper — never re-implement session parsing.
- `verifyJwt` validates RS256 against the api JWKS URL with cached keys; returns `{ userId }`.
- Use Better Auth's generator for its tables; commit the resulting Drizzle schema + migration.

## Don't
- Don't store provider secrets or `BETTER_AUTH_SECRET` anywhere but `.env`.
- Don't hand-roll session cookies or JWT verification beyond the JWKS helper.
- Don't add notes/dashboard data — `/dashboard` is a gated placeholder in this slice.
- Don't use `as any` on Better Auth/Drizzle types.
