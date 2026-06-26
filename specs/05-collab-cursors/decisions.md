# 05 · Collaboration & Cursors — Decisions

## ADR-001: Redis extension for cross-instance fanout
### Context
Multiple `socket` instances must share document updates + awareness; the revoke broadcast (07) needs a bus too.
### Options Considered
1. `@hocuspocus/extension-redis` — native, drops into the existing server, handles doc + awareness fanout.
2. Hand-rolled `ioredis` pub/sub — re-implements the extension; easy to get awareness/GC wrong.
3. Sticky sessions (no fanout) — brittle, can't broadcast admin events cross-instance.
### Decision
`@hocuspocus/extension-redis`. Reused by slice 07 for `revoke:{noteId}`.
### Consequences
- One Redis dependency for fanout, revoke, and (slice 06) permissions cache.

## ADR-002: Server-authoritative awareness identity
### Context
Yjs awareness is client-driven; a client could claim another user's name.
### Decision
Server stamps `{userId,name}` from the verified JWT onto the connection; client sends cursor geometry only.
### Consequences
- Cursors can't be spoofed; web identity fields in awareness are ignored/overwritten server-side.

## ADR-003: Deterministic color from userId
### Context
Cursors need stable, distinguishable colors without storing a color per user.
### Decision
`color = hashToHsl(userId)`; computed wherever identity is rendered.
### Consequences
- No color column; same person is the same color across sessions/notes.
