# 05 · Collaboration & Cursors — Design

## Goal State (acceptance)
1. Two clients connected to the same note see each other's edits in **real time** with no refresh.
2. Each editor sees the others' **live caret + text selection** ("what's being edited"), labeled with the
   user's name and a stable color.
3. A **presence list** shows everyone currently in the note.
4. With **two `socket` instances** behind Redis, clients on different instances still sync edits + cursors
   (cross-instance fanout proven).
5. Awareness identity (`userId`, `name`, `color`) is **server-authoritative** — stamped from the verified
   JWT, not client-supplied; a client cannot spoof another identity.
6. Cursors/presence are ephemeral — nothing about awareness is written to Postgres.

> Still owner-only at the auth layer (multi-user via two tabs/sessions of the owner, or two socket
> instances). True multi-user via sharing arrives in slice 06; this slice proves the realtime mechanics.

## Scope
**In:** `@hocuspocus/extension-redis` for document + awareness fanout; server-authoritative awareness
identity injection; TipTap `CollaborationCursor` wiring in web; presence list UI; deterministic color
from `userId`.
**Out:** sharing/links, view/edit roles, read-only enforcement (06); the private-toggle (07).

## Design
- **Redis fanout**: add `@hocuspocus/extension-redis` to the `socket` server (Redis URL from env). Each
  instance publishes Yjs updates + awareness on a per-document channel; all instances apply them. This is
  also the bus slice 07 reuses for the revoke broadcast.
- **Server-authoritative awareness**: in `onAuthenticate`/connection context, attach `{ userId, name }`
  from the verified JWT to the connection. The client may only send cursor *geometry*; the server stamps
  identity so awareness states can't be forged. `color` derived deterministically from `userId`.
- **web**: add `CollaborationCursor` (TipTap) bound to the provider awareness, rendering remote carets +
  selections with name labels. A presence component reads awareness states → list of active users.
- **Run config**: a way to start two `socket` instances locally (different ports) sharing one Redis to
  validate fanout (documented in implementation notes / a compose override or two dev commands).

## Implementation tasks
1. Add `extension-redis` to `socket` (env `REDIS_URL`) → verify two instances sync a doc.
2. Inject server-authoritative `{userId,name,color}` into awareness → verify client cannot override identity.
3. web `CollaborationCursor` wiring → verify remote caret + selection render with labels.
4. Presence list from awareness states → verify it reflects join/leave.
5. Two-instance manual test (clients split across instances) → verify edits + cursors fan out via Redis.

## Test plan
- Manual: two browsers/tabs editing → live text sync + visible labeled cursors + presence updates.
- Two-instance: start socket A and B sharing Redis; one client on each → cross-instance sync works.
- Security check: a tampered client awareness identity is overridden/ignored server-side.

## Risks / notes
- Awareness GC + reconnection: ensure stale cursors clear on disconnect (Hocuspocus handles, verify).
- Color determinism: hash `userId` → HSL; ensure adequate contrast/distinctness.
- Keep awareness payload small (no avatars by URL spam); name + color + cursor only.
- Redis channel naming must match what slice 07's revoke broadcast expects (document the convention).
