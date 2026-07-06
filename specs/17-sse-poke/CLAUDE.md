# CLAUDE.md — 17 · SSE + Redis Poke Transport

## Project Context

The metadata-lane puller (spec 16) is authoritative but needs a signal for *when* to pull. This spec
adds the **poke**: a dataless "pull now" trigger delivered over **Server-Sent Events on `apps/api`,
fanned out via Redis** (ADR-0005). A new `GET /api/sync/stream` (in `apps/api/src/sync/router.ts`)
authenticates via the Better Auth cookie, subscribes Redis `poke:user:{userId}`, emits a `poke` SSE
event per message, and heartbeats. After a push commits (spec 19), the server publishes a poke to each
touched note's **affected audience** (owner + active collaborators, via `@yapper/permissions`) —
this spec owns the channel contract (`pokeChannel`) + publish helper (`publishPokes`); spec 19 owns
the call site. The client opens one `EventSource('/api/sync/stream')` (`apps/web/lib/sync/poke.ts`)
behind the flag and runs the puller **coalesced** (a burst of pokes → one pull), with always-on
**backstops** (pull on focus/visibilitychange/online) covering any missed poke or reconnect gap.
Pokes are best-effort — the CVR pull is the source of truth. Builds late (14 → 15 → 18 → 19 → 16 → 21
→ **17** → 20).

## Before Starting Work

1. Read `specs/17-sse-poke/design.md` (goal state + endpoint/fanout/client detail).
2. Read `decisions.md` (cite ADR-0005; spec-local: heartbeat interval, coalescing window, per-tab).
3. Read the governing ADR `docs/adr/0005-sse-redis-poke-transport.md` and the shared authoring brief.
4. Check `implementation.md` for progress; confirm specs **14, 16, 19** are in place first.
5. Study the patterns you are mirroring:
   - `apps/socket/src/revoke.ts` — the `IORedis` `psubscribe`/`pmessage` fanout pattern (mirror it
     per-connection + user-scoped for the subscriber).
   - `apps/api/src/redis.ts` — `redisPublisher` (`buildRedisPublisher()`, null-tolerant); reuse it.
   - `packages/permissions/src/events.ts` — where `revokeChannel`/`roleChangeChannel`/
     `buildRedisPublisher` live; add `pokeChannel` here.
   - `packages/permissions/src/loaders.ts` — `loadNote` / `isActiveCollaborator` for the audience.
   - `apps/api/src/app.ts`, `authed.ts`, `auth/requireAuth.ts` — how gated routers mount + get `userId`.
   - `apps/web/lib/auth-client.ts` — `NEXT_PUBLIC_API_URL` origin + credentialed cross-origin calls.
   - `apps/web/app/providers.tsx` — the app tree where a `useSyncPoke()` mount hook fits.

## Code Patterns

- **SSE over Express, no new dep:** raw `res.writeHead`/`res.flushHeaders` + `res.write`; frames are
  `event: poke\ndata: {json}\n\n`; heartbeats are comment frames `: ping\n\n`. Keep the `authed()`
  promise pending until `req.on("close")`, then clean up (clear heartbeat, `sub.quit()`).
- **One Redis subscriber per stream** (subscribe-mode connections can't be shared). Factory returns
  `null` when `REDIS_URL` is unset — the stream still opens + heartbeats, it just never pokes.
- **Synthesize the poke frame server-side** (`pokeEventSchema.parse({ type: "poke", ... })`); ignore
  the Redis payload (publishers send a `"1"` sentinel). The browser never parses channel data.
- **Channel contract owned here:** `pokeChannel(userId)` → `poke:user:${userId}` in
  `packages/permissions/src/events.ts`. `publishPokes(publisher, userIds)` dedupes and optional-chains
  the publisher (no-op when null). Reuse the existing `redisPublisher`.
- **Affected audience = owner + active collaborators**, via `@yapper/permissions` loaders — never
  re-implement membership. Spec 19 unions audiences across a push and calls `publishPokes` once.
- **Client = one `EventSource` per tab**, `withCredentials: true`, absolute `NEXT_PUBLIC_API_URL`
  origin, gated on `isSyncEngineEnabled()`. Coalesce pokes into one `pull()` (trailing debounce).
  **Backstops** (focus / visibilitychange→visible / online) are registered independently and fire even
  when the stream is down. Let EventSource auto-reconnect — don't hand-roll reconnect.
- **Contracts:** `pokeEventSchema` in `@yapper/schemas` (`sync.ts`), imported by web + api; derive the
  type with `z.infer`. Never duplicate the frame shape.
- **TDD (write red first):** API — poke published to `poke:user:{owner}` + `poke:user:{collaborator}`
  but not an unrelated user, via a fake `RedisPublisher`; `pokeChannel` unit + `publishPokes` dedupe.
  Client — three `poke` events coalesce into **one** `pull` (fake timers); backstops fire a pull; flag
  off opens no EventSource. Green + `tsc --noEmit` + Biome before done.

## Gotchas (repo)

- **No local Docker:** Redis is remote Upstash; tests run **Redis-free** (`REDIS_URL` deleted in
  socket test-setup) — so assert publishes via a **mock `RedisPublisher`**, not a live Redis.
- **Run tests from each app dir** (Bun loads `.env` from cwd). `apps/api` → `bun test`. `apps/web` →
  Vitest, full suite OOMs; use `bunx vitest run --maxWorkers=1`.
- SSE streaming over supertest is awkward — keep the API SSE test to status/headers; assert
  coalescing/delivery in the client Vitest test with a mocked `EventSource` + fake timers.

## Don't

- Don't make pokes a correctness dependency — they are best-effort triggers. Never gate data
  correctness on poke delivery; the CVR pull (spec 16) is authoritative.
- Don't put data in the poke, and don't parse the Redis payload into the browser frame — synthesize
  the frame from `pokeEventSchema` server-side.
- Don't hand-roll EventSource reconnect, and don't drop the backstops — they cover the reconnect gap.
- Don't touch the note-scoped `revoke:{noteId}` / `role-change:{noteId}` channels or Hocuspocus /
  realtime co-editing — this is a new **user-scoped** channel, orthogonal to them.
- Don't open the EventSource or register backstops when `NEXT_PUBLIC_SYNC_ENGINE` is off.
- Don't leak per-connection resources — always `clearInterval(heartbeat)` + `sub.quit()` on
  `req.on("close")`, and close the stream + remove listeners on client unmount.
- Don't build the push call site here — this spec owns the channel + `publishPokes`; **spec 19** wires
  the call after commit.
- Don't add a Redis dependency or a second pub/sub abstraction — reuse `@yapper/permissions` +
  `apps/api/src/redis.ts`. No `as any`. No secrets/`.env`.
