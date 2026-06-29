# packages/auth

`@yapper/auth` is the single source of authentication for the Yapper monorepo. It holds the Better Auth server config (Google + GitHub OAuth via Drizzle adapter, plus the JWT plugin) and a stateless JWT/JWKS verification helper. The `api` app mounts the Better Auth handler from here; `web` talks to that handler through the Better Auth React client; and `socket` uses the verify helper to authenticate WebSocket handshakes statelessly against the api's JWKS endpoint.

## Tech Stack

- **better-auth** (`^1.3.4`) — auth server, Drizzle adapter (`better-auth/adapters/drizzle`), and JWT plugin (`better-auth/plugins`).
- **jose** (`^5.9.6`) — remote JWKS fetch (`createRemoteJWKSet`) and JWT verification (`jwtVerify`).
- **drizzle-orm** (`^0.44.2`) — peer of the Drizzle adapter.
- **@yapper/db** (`workspace:*`) — provides the `db` client and the auth tables (`user`, `session`, `account`, `verification`, `jwks`).
- **Runtime/tests**: Bun (`bun test`), TypeScript strict (extends `@yapper/typescript-config/node.json`).

## File Structure

- `package.json` — package name `@yapper/auth`; two entry points via `exports`: `.` → `src/index.ts`, `./verify` → `src/verify.ts`. No build step (TS consumed directly).
- `tsconfig.json` — extends the shared node config; compiles `src`.
- `src/index.ts` — barrel re-exporting the public API from `auth.ts` and `verify.ts`.
- `src/auth.ts` — the Better Auth instance (`auth`) and its inferred `Auth` type. Configures base URL, secret, trusted origins, Drizzle adapter (`provider: "pg"`, `generateId: false`), Google + GitHub social providers, and the `jwt()` plugin.
- `src/verify.ts` — `verifyJwt` helper plus `VerifyOptions` / `VerifiedToken` types. Lazily creates and caches the remote JWKS, verifies a Better Auth JWT against it, and returns `{ userId, name }`.
- `src/verify.test.ts` — Bun tests for `verifyJwt` (valid token, name claim, tampered payload, expired token, wrong issuer, unknown signing key) using a local in-memory JWKS.

## Exports

### `@yapper/auth` (`src/index.ts`)

- `auth` — the configured Better Auth server instance. Mount `auth.handler` in the api; use it server-side for session/auth operations.
- `Auth` (type) — `typeof auth`, the inferred instance type.
- `verifyJwt` — re-exported from `./verify` (see below).
- `VerifiedToken`, `VerifyOptions` (types) — re-exported from `./verify`.

### `@yapper/auth/verify` (`src/verify.ts`)

- `verifyJwt(token, options?)` — verifies a Better Auth JWT against the JWKS and resolves to `VerifiedToken`; throws if signature, issuer, audience, or expiry is invalid. Defaults to the api JWKS endpoint and caches keys; `options.jwks` is injectable for tests.
- `VerifyOptions` (type) — `{ jwks?, issuer?, audience? }`; override key resolver / expected `iss` / `aud`.
- `VerifiedToken` (type) — `{ userId: string; name: string }`; `userId` is the token `sub`, `name` falls back to `"Anonymous"`.

### Environment variables read by this package

- `auth.ts`: `WEB_ORIGIN` (default `http://localhost:3000`), `BETTER_AUTH_URL` (default `http://localhost:4000`), `BETTER_AUTH_SECRET`, `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `GITHUB_CLIENT_ID`, `GITHUB_CLIENT_SECRET`.
- `verify.ts`: `AUTH_ISSUER` (falls back to `BETTER_AUTH_URL`, then `http://localhost:4000`), `AUTH_JWKS_URL` (defaults to `${issuer}/api/auth/jwks`).

## When to Use

Depend on `@yapper/auth` whenever an app needs server-side auth wiring or must validate a Better Auth token.

- **api** — import `auth` to mount the Better Auth request handler:

  ```ts
  import { auth } from "@yapper/auth";
  // e.g. route all /api/auth/* requests to auth.handler
  ```

- **socket** — import `verifyJwt` to authenticate the WS handshake statelessly (no DB hit; verified against the api's JWKS):

  ```ts
  import { verifyJwt } from "@yapper/auth/verify";

  const { userId, name } = await verifyJwt(handshakeToken);
  // throws on invalid/expired/wrong-issuer tokens — reject the connection
  ```

- **tests / non-default issuers** — pass `VerifyOptions` to inject a local JWKS or override the expected issuer/audience:

  ```ts
  await verifyJwt(token, { jwks: localJwks, issuer: "http://localhost:4000" });
  ```

Do not reimplement OAuth config or token verification elsewhere — this package is the single source for both. The `web` app should use the Better Auth React client to talk to the api handler rather than importing `auth` directly.
