# 02 · Auth — Decisions

## ADR-001: Better Auth defined in `packages/auth`, hosted by `api`
### Context
Three services need identity; the WS handshake can't rely on cookies cleanly.
### Options Considered
1. Auth.js in `web` — great Next.js DX, but `api`/`socket` would call back into `web` to validate.
2. Better Auth in `web` — same callback-into-frontend problem for backend services.
3. Better Auth in `packages/auth`, mounted by `api` — `api` is the auth authority; stateless JWT for socket.
### Decision
Option 3. `api` mounts `/api/auth/*`; web uses the Better Auth React client; JWT plugin for the socket leg.
### Consequences
- Must configure cross-origin CORS + credentialed cookies (web↔api). Socket verifies JWT via JWKS, no DB hop.

## ADR-002: JWT plugin (JWKS) for the WebSocket handshake
### Context
Hocuspocus `onAuthenticate` needs a credential it can verify without a per-connection DB/HTTP call.
### Decision
Enable Better Auth `jwt()` plugin; web passes a short-lived JWT as the Hocuspocus `token`; `socket`
verifies RS256 against the api JWKS endpoint (cached keys). `@yapper/auth` exports `verifyJwt`.
### Consequences
- Browser session stays cookie-based; only the socket leg uses JWT. Token TTL must be short; web refreshes it.

## ADR-003: Better Auth owns the `user` table; FKs added here
### Context
Slice 01 created note tables with `owner_id`/`user_id` but deferred the FK to `user`.
### Decision
Generate Better Auth tables via its CLI into `@yapper/db`; add FK constraints from note tables to `user.id`.
### Consequences
- Auth schema is generated (not hand-written); a follow-up migration adds the FKs.
