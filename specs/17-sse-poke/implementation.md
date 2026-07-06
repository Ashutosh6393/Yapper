# 17 · SSE + Redis Poke Transport — Implementation

## Status: not-started

## Completed

## In Progress

## Blocked

- Depends on **spec 14** (sync router scaffold + `@yapper/schemas` `sync.ts` module +
  `apps/web/lib/sync/flag.ts`), **spec 16** (client `pull()` + `POST /api/sync/pull`), and **spec 19**
  (push commit path that calls `publishPokes` with touched note ids). Build order:
  14 → 15 → 18 → 19 → 16 → 21 → **17** → 20.

## Next Steps

1. Add `pokeEventSchema` to `@yapper/schemas` (`sync.ts`) — shape `{ type: "poke", ts?: number }`;
   export the inferred `PokeEvent` type. Write its unit test first.
2. Add `pokeChannel(userId)` to `packages/permissions/src/events.ts` (→ `poke:user:${userId}`) +
   `publishPokes(publisher, userIds)` helper (dedupe, optional-chain the publisher). Unit-test channel
   name + dedupe. (Red first.)
3. Add a `buildPokeSubscriber()` factory (mirror `apps/socket/src/revoke.ts`; `null` when `REDIS_URL`
   unset) — one `IORedis` subscriber per stream.
4. Add `GET /stream` to `apps/api/src/sync/router.ts` (behind `requireAuth` + `authed()`): SSE headers,
   `flushHeaders`, subscribe `pokeChannel(userId)`, emit `event: poke` frames, 25s heartbeat, cleanup
   on `req.on("close")`. Supertest: `401` unauth, `200` + `text/event-stream` authed.
5. Wire the audience computation + `publishPokes` call into the push path — **spec 19** owns the call
   site; this spec provides the helper. Write the API goal-state test (poke published to owner +
   active collaborator, not an unrelated user) against a mock `RedisPublisher`.
6. Add `apps/web/lib/sync/poke.ts`: one `EventSource('/api/sync/stream', { withCredentials: true })`
   gated on `isSyncEngineEnabled()`; coalesced `pull()` scheduler (300 ms trailing debounce); backstops
   (focus / visibilitychange→visible / online); teardown. Mount via a `useSyncPoke()` hook near the
   engine root. Client goal-state tests first: three pokes → one pull (fake timers); backstops fire a
   pull; flag-off opens no EventSource.
7. Verify green + `tsc --noEmit` clean + Biome clean (run web tests from `apps/web` with
   `--maxWorkers=1`; api tests from `apps/api`).

## Session Notes
