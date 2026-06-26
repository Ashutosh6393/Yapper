# CLAUDE.md — 05 · Collaboration & Cursors

## Project Context
Prove the realtime mechanics: cross-instance fanout via Redis, live cursors/selections, and a presence
list — with server-authoritative identity. Still owner-only at the auth layer (sharing is slice 06).

## Before Starting Work
1. Read `design.md`.
2. Ensure slice 04 done (single-user editing + persistence works).
3. Confirm Redis from slice 00 Compose is running.
4. Check `implementation.md`.

## Code Patterns
- Add `@hocuspocus/extension-redis` to the existing `socket` server config (don't fork the server).
- Identity in awareness is set server-side from the verified JWT; client sends cursor geometry only.
- `color` = deterministic hash of `userId` → HSL; same person, same color everywhere.
- Document the Redis channel naming convention — slice 07 reuses the bus for revoke.

## Don't
- Don't let the client set its own `userId`/`name` in awareness (anti-spoof).
- Don't persist any awareness/cursor data to Postgres.
- Don't add sharing/roles/read-only here (slice 06).
- Don't bloat the awareness payload.
