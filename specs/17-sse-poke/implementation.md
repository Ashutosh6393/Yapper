# 17 · SSE + Redis Poke Transport — Implementation

## Status: done

## Completed

- **Schemas** — `pokeEventSchema` gained an additive optional `ts` (`{ type: "poke", ts?: number }`);
  test updated.
- **Permissions** (`packages/permissions`) — `events.ts`: `publishPokes(publisher, userIds)` (dedupe +
  null-tolerant) and `buildPokeSubscriber(userId, onPoke)` (one IORedis subscriber on
  `poke:user:{id}`, `null` when `REDIS_URL` unset); `loaders.ts`: `loadNoteAudience(noteId)` = owner +
  active collaborators. Exported from the barrel. `events.test.ts` (channel + dedupe).
- **API push** (`apps/api/src/sync/push.ts`) — replaced the pusher-only poke with **audience fanout**:
  collect touched note ids from applied mutations, union each note's `loadNoteAudience` with the pusher,
  `publishPokes` once. `push.poke.test.ts`: owner + active collaborator poked, unrelated user not.
- **API stream** (`apps/api/src/sync/stream.ts` + wired `GET /stream` in `router.ts`) — SSE endpoint
  behind `authed`: `text/event-stream` headers + `flushHeaders`, `buildPokeSubscriber`, `event: poke`
  frames synthesized from `pokeEventSchema` (Redis payload ignored), 25s heartbeat, full cleanup on
  `req` close. `stream.test.ts`: `401` unauth; `200` + `text/event-stream` authed (raw-http, destroyed
  on headers so the never-ending stream doesn't hang supertest).
- **Web** (`apps/web/lib/sync/poke.ts`) — `useSyncPoke()`: one `EventSource('/api/sync/stream',
  { withCredentials })` gated on the flag, 300 ms trailing-debounce coalescer, focus/visibilitychange/
  online backstops, full teardown. Mounted in `SyncEngineBootstrap` (flag-on path only).
  `poke.test.tsx`: opens one credentialed ES; 3 pokes → 1 pull; backstops fire with the stream down;
  flag-off is inert. Updated `provider.test.tsx` to stub `EventSource` (jsdom has none).

Verify: `tsc --noEmit` clean in schemas/permissions/api/web; Biome clean on changed files; api sync
suite 18/18, web sync suite green, permissions/schemas unit tests green.

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

- **Spec 19 already published a poke, but only to the pusher's own channel.** Spec 17 upgraded that call
  site to the full **affected audience** (owner + active collaborators of each touched note ∪ pusher).
  `pokeUserChannel` already existed in permissions; reused it (didn't add a duplicate `pokeChannel`).
- **Audience is computed post-commit → a made-private note's just-revoked collaborators aren't in it.**
  That's fine and matches the "current active collaborators" rule: pokes are best-effort, and the
  removed collaborator reconciles on their next focus/online backstop pull (the socket revoke channel
  still kicks them from the live doc). Documented rather than special-cased.
- **Label mutations (`createLabel`/`renameLabel`/`deleteLabel`) return no touched note id** — they touch
  the owner's carrier notes whose only audience is the owner, who is always the pusher (already poked).
- **SSE over supertest hangs** (the stream never ends), so the `200`/headers test uses a raw `http.get`
  destroyed as soon as headers arrive; the `401` case uses supertest normally.
- **jsdom has no `EventSource`** — stubbed a controllable mock in `poke.test.tsx` and a no-op in
  `provider.test.tsx` (whose flag-on path now opens the stream). Production code needs no guard (all
  browsers have EventSource; the hook runs client-only in `useEffect`).
- Ran web tests with `bunx vitest run --no-file-parallelism` (`--maxWorkers=1` errors on this vitest).
- Not committed — awaiting user go-ahead.
