# 05 · Collaboration & Cursors — Implementation

## Status: done

## Completed
1. **Redis fanout** — `@hocuspocus/extension-redis` wired into the `socket` server, gated on
   `REDIS_URL` (`apps/socket/src/redis.ts`). Uses `createClient` so the extension gets independent
   pub + sub connections (a subscriber-mode connection can't also publish — this fixed an Upstash
   `ERR only (P)SUBSCRIBE … allowed in this context` error). Channel/key namespace is the constant
   `REDIS_PREFIX = "yapper"` — **slice 07's revoke broadcast reuses this same bus/prefix.**
2. **Server-authoritative identity** — `verifyJwt` now returns `{ userId, name }` (Better Auth signs
   the whole user object, so `name` rides as a claim). `authorizeConnection` stamps
   `{ userId, name, color }` onto the connection context; `color = colorFromUserId(userId)` (FNV-1a →
   HSL, deterministic). The `connected` hook pushes `{ type: "identity", user }` to the client via
   `connectionInstance.sendStateless(...)`. The client never declares its own identity (anti-spoof).
3. **web `CollaborationCaret`** — appended to the editor extensions bound to the provider; broadcasts
   this client's caret + selection geometry. On the stateless `identity` message the client calls
   `editor.commands.updateUser(user)` so its awareness label is the server-stamped identity.
4. **Presence list** — `Presence` component reads `provider.awareness` states (deduped by `user.id`),
   re-rendering on awareness `change` (join/leave/cursor move).
5. **Two-instance fanout** — verified manually against the real (Upstash) Redis: two `Hocuspocus`
   instances on different ports sharing one `REDIS_URL`, a client on each → an edit on one reached the
   other. PASS. (Note: the exported `Server` is a singleton, so a *single process* can only host one
   instance; real deployments run one process per instance — see "Running two instances" below.)

## Tests
- `packages/auth/src/verify.test.ts` — `verifyJwt` returns the `name` claim.
- `apps/socket/src/identity.test.ts` — color determinism; identity built solely from server context.
- `apps/socket/src/auth.test.ts` — context carries server-authoritative `name` + deterministic `color`.
- `apps/socket/src/awareness.test.ts` — over a real WebSocket: (a) the server pushes the JWT-derived
  identity via stateless; (b) one client's awareness state reaches a second client.
- Automated socket tests run **single-instance** (Redis fanout dropped via `test-setup.ts`); the
  two-instance path is the manual check above (goal state 4).

## Running two instances locally
Both share one Redis (`REDIS_URL` in `apps/socket/.env`):
```
# terminal 1
SOCKET_PORT=1234 bun run --cwd apps/socket start
# terminal 2
SOCKET_PORT=1235 bun run --cwd apps/socket start
```
Point one browser tab at each (`NEXT_PUBLIC_SOCKET_URL`) to see cross-instance sync + cursors.

## Blocked
- None.

## Next Steps
- Slice 06 (sharing/permissions) replaces the owner-only `onAuthenticate` check with
  `@yapper/permissions`; awareness/identity wiring here stays as-is.

## Session Notes
- Hocuspocus v2 `connectedPayload.connectionInstance` is the `Connection` (has `sendStateless`);
  `connected` is the right hook to push per-connection identity after auth.
- TipTap v3 renamed `CollaborationCursor` → `@tiptap/extension-collaboration-caret`.
