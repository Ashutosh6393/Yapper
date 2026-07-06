# 17 · SSE + Redis Poke Transport — Design

The metadata lane's puller (spec 16) is authoritative, but nothing tells the client *when* to pull.
Without a signal the client would only reconcile on an interval, so a rename on a laptop or a
collaborator's edit would take up to a poll cycle to appear on another device. This spec adds the
**poke** — a lightweight, dataless "you have changes, pull now" signal delivered over **Server-Sent
Events on `apps/api`, fanned out via Redis** (ADR-0005). A poke carries no payload; it only triggers
`POST /api/sync/pull`.

Concretely: a new `GET /api/sync/stream` SSE endpoint (in the sync router, `apps/api/src/sync/router.ts`)
authenticates via the existing Better Auth cookie and subscribes the connection to the Redis channel
`poke:user:{userId}`; on each message it emits a `poke` SSE event and it heartbeats to keep the pipe
open. After a push commits (spec 19), the server computes each touched note's **affected audience**
(owner + current collaborators, via `@yapper/permissions`) and `PUBLISH`es to each user's channel —
this spec owns the channel contract and the publish helper; spec 19 owns the call site. On the client,
a single `EventSource('/api/sync/stream')` (`apps/web/lib/sync/poke.ts`), mounted behind
`NEXT_PUBLIC_SYNC_ENGINE`, runs the puller (spec 16) on each message, **debounced/coalesced** so a
burst of pokes causes exactly one pull. Because pokes are best-effort (never a correctness
dependency), two **always-on backstops** — pull on window focus/`visibilitychange` and on network
reconnect — cover any missed or delayed poke and the window while SSE is reconnecting.

This reuses the exact Redis fanout pattern the socket app already uses for revoke/role channels
(`apps/socket/src/revoke.ts` — `psubscribe` + `pmessage`); only the channel namespace (`poke:user:{id}`,
user-scoped rather than note-scoped) and the browser transport (SSE vs WebSocket) are new. Everything
stays behind the feature flag until the whole engine is complete.

## Goal State (acceptance)

**Server — SSE endpoint + fanout**
1. `GET /api/sync/stream` exists on `apps/api` behind `requireAuth` (Better Auth cookie, resolved via
   the same `SessionResolver` every other gated route uses). Unauthenticated requests get `401`; it
   never trusts a client-supplied user id.
2. On connect the handler sets SSE response headers (`Content-Type: text/event-stream`,
   `Cache-Control: no-cache, no-transform`, `Connection: keep-alive`), flushes headers immediately,
   and subscribes a dedicated Redis subscriber connection to `poke:user:{userId}` (the caller's id
   from `req.userId`).
3. Each Redis message on that channel is emitted to the browser as one SSE `event: poke` frame whose
   `data` line is a JSON body validated to `pokeEventSchema` before send.
4. The endpoint writes a heartbeat comment frame (`: ping\n\n`) on a fixed interval (see decisions.md)
   so proxies and the browser keep the connection open and a dead pipe is detected.
5. On client disconnect (request `close`/`aborted`) the handler **unsubscribes and quits its Redis
   subscriber and clears the heartbeat timer** — no leaked subscriptions or timers per connection.
6. A push that mutates a note publishes a poke to **every user in that note's affected audience**
   (owner + current active collaborators, derived via `@yapper/permissions`), including the mutating
   user's *other* sessions. The channel name + publish helper are owned here and imported by the
   pusher (spec 19). When `REDIS_URL` is unset the publish path is a no-op (optional-chaining), exactly
   like the existing `redisPublisher`.

**Client — EventSource + backstops**
7. When `isSyncEngineEnabled()` is true, the web app opens exactly **one** `EventSource('/api/sync/stream')`
   (absolute `NEXT_PUBLIC_API_URL` origin, `withCredentials: true`) per tab, in `apps/web/lib/sync/poke.ts`,
   mounted once from the app tree. When the flag is off, no EventSource is opened and today's TanStack
   Query notes path is untouched.
8. An incoming `poke` message schedules the puller (spec 16); a **burst of pokes within the coalescing
   window results in exactly one `pull()`** call (debounced/coalesced trailing-edge).
9. **Backstops (always on, independent of the SSE connection):** the client pulls on window `focus`
   and on `document.visibilitychange` → visible, and on `window` `online` (network reconnect). These
   fire even if the EventSource is currently down, closing the reconnect gap.
10. The client never treats a missing/dropped poke as an error surface: EventSource auto-reconnects
    silently; a missed poke only delays a pull until the next poke/focus/reconnect. No toast, no
    correctness impact (the CVR pull is authoritative — ADR-0004).

**Cross-cutting**
11. `pokeEventSchema` lives in `@yapper/schemas` and is the single source of truth for the poke frame
    shape, imported by both `apps/api` (before send) and `apps/web` (on receive). No duplicated shape.
12. Strict TS, no `as any`; Biome-clean (2-space, double quotes, 100 cols). The endpoint tolerates a
    null Redis (dev/test without `REDIS_URL`): it still opens the stream and heartbeats, it just never
    receives pokes.

## Scope

**In:**
- `apps/api/src/sync/router.ts` — add `GET /stream` (SSE) to the sync router introduced by spec 14.
- The **poke channel contract** — `pokeChannel(userId)` → `poke:user:{userId}` — and a **publish
  helper** (audience → publish a poke per user), owned by this spec. Placed alongside the existing
  channel helpers in `@yapper/permissions` (`packages/permissions/src/events.ts`, where
  `revokeChannel`/`roleChangeChannel`/`buildRedisPublisher` already live) so the fanout primitives
  stay in one package; the audience computation reuses `@yapper/permissions` derivation/loaders.
- A **Redis subscriber factory** for the SSE endpoint (mirrors `setupRevokeSubscriber` in
  `apps/socket/src/revoke.ts` but per-connection and user-scoped): one `IORedis` subscriber per open
  stream, `subscribe(pokeChannel(userId))`, `on("message", …)`.
- `pokeEventSchema` in `@yapper/schemas` (shape defined here; the `sync.ts` schemas module is
  established by spec 14 — add the poke event to it).
- `apps/web/lib/sync/poke.ts` — the single `EventSource`, the coalesced pull scheduler, and the
  focus/visibility/online backstop listeners; a small mount hook (e.g. `useSyncPoke()`) gated on
  `isSyncEngineEnabled()`, wired into the app tree (see spec 15 for where the engine mounts).

**Out (cite sibling specs):**
- `POST /api/sync/push` and the server mutators that *decide* a note was touched — **spec 19**. This
  spec exposes the publish helper; spec 19 calls it after commit.
- `POST /api/sync/pull` / the CVR delta protocol and the `pull()` client function this poke triggers —
  **spec 16**. The poke is purely a trigger; it never carries data.
- Dexie store, `rebuild()`, `db.sync` cookie/lastMutationID — **spec 15**.
- The sync router scaffold, `isSyncEngineEnabled()`/`apps/web/lib/sync/flag.ts`, and the
  `@yapper/schemas` `sync.ts` module skeleton — **spec 14**.
- Sharing a single SSE across tabs via `BroadcastChannel`/leader election — **future-work.md**.
- Any change to Hocuspocus / realtime co-editing / the revoke/role channels — untouched (orthogonal).

---

## Server: `GET /api/sync/stream` (SSE endpoint)

Mounted in `apps/api/src/sync/router.ts` (the router spec 14 mounts at `/api/sync` in `apps/api/src/app.ts`,
behind `requireAuth(resolve)` like `notesRouter`/`labelsRouter`). Uses the local `authed()` wrapper
(`apps/api/src/authed.ts`) so the handler receives a non-nullable `userId: string`.

Handler outline (SSE over Express, no new dependency — raw `res.write`):

```
GET /api/sync/stream  (authed → userId)
  res.status(200).set({
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache, no-transform",
    "Connection": "keep-alive",
  })
  res.flushHeaders()
  res.write(": connected\n\n")                 // initial comment kicks the stream open

  const sub = buildPokeSubscriber()             // one IORedis subscriber (null when REDIS_URL unset)
  sub?.subscribe(pokeChannel(userId))
  sub?.on("message", (_channel, _payload) => {
    const event: PokeEvent = pokeEventSchema.parse({ type: "poke", ts: Date.now() })
    res.write(`event: poke\ndata: ${JSON.stringify(event)}\n\n`)
  })

  const heartbeat = setInterval(() => res.write(": ping\n\n"), HEARTBEAT_MS)

  req.on("close", () => {                        // client navigated away / EventSource.close()
    clearInterval(heartbeat)
    void sub?.quit()
  })
```

Notes:
- **Never resolve the promise** while the stream is open — the `authed()` wrapper's returned promise
  stays pending until `req.on("close")` fires (resolve it there). This keeps Express from ending the
  response.
- The **Redis payload is ignored**: the poke is dataless. We synthesize a fresh `pokeEventSchema`
  frame on our side so the browser never parses attacker-influenced channel data. (Publishers send a
  minimal `"1"` sentinel — see below.)
- **One subscriber connection per stream.** A Redis subscriber connection is in subscribe mode and
  cannot be shared with the publisher or with other channels' logic — same constraint noted for
  `buildRedisPublisher`. `buildPokeSubscriber()` returns `null` when `REDIS_URL` is unset; the stream
  still opens and heartbeats (dev/test path, and tests delete `REDIS_URL`).
- **CORS/credentials:** the stream rides the same cookie/origin as every other `api` call; `app.ts`
  already sets `cors({ origin: WEB_ORIGIN, credentials: true })`, which covers EventSource's
  `withCredentials`.

### Channel contract + publish helper (owned here)

Add to `packages/permissions/src/events.ts` (next to `revokeChannel`/`roleChangeChannel`):

```
export function pokeChannel(userId: string): string {
  return `poke:user:${userId}`;
}
```

Publish helper (audience fanout) — a thin function the pusher (spec 19) calls after commit:

```
// publishPokes(publisher, userIds): publish a dataless sentinel to each user's poke channel.
// publisher is the existing RedisPublisher | null (apps/api/src/redis.ts). No-op when null.
for (const userId of new Set(userIds)) {
  await publisher?.publish(pokeChannel(userId), "1");
}
```

**Affected audience** for a touched note = owner + current **active** collaborators. Reuse
`@yapper/permissions` loaders (`loadNote` for `ownerId`; an active-collaborator query — the same
data behind `isActiveCollaborator`) rather than re-deriving membership. Spec 19 accumulates the set of
touched note ids across a push's mutations, resolves the union of their audiences, and calls
`publishPokes` once. This spec defines `pokeChannel` + `publishPokes`; spec 19 owns *when* and *with
which note ids* they are called (documented in the Dependencies note).

Reuses `redisPublisher` from `apps/api/src/redis.ts` (already `buildRedisPublisher()`), so no new
publisher wiring — only the new channel + helper.

---

## Client: single `EventSource` + coalesced pull + backstops

`apps/web/lib/sync/poke.ts` (new). Mounted once behind the flag (a `useSyncPoke()` hook rendered near
the engine root — see spec 15 for the mount point; do not open the stream when
`isSyncEngineEnabled()` is false).

```
// one EventSource per tab
const url = `${process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000"}/api/sync/stream`;
const es = new EventSource(url, { withCredentials: true });

// coalesce: many pokes → one pull (trailing debounce, COALESCE_MS)
let timer: ReturnType<typeof setTimeout> | null = null;
function schedulePull() {
  if (timer) return;                       // already scheduled → coalesce
  timer = setTimeout(() => { timer = null; void pull(); }, COALESCE_MS);
}

es.addEventListener("poke", () => schedulePull());   // pokeEventSchema-typed; payload unused (trigger only)

// backstops — ALWAYS ON, independent of es state
window.addEventListener("focus", schedulePull);
document.addEventListener("visibilitychange", () => {
  if (document.visibilityState === "visible") schedulePull();
});
window.addEventListener("online", schedulePull);     // network reconnect
```

- `pull()` is spec 16's puller. This module never touches Dexie or the CVR — it only *schedules*.
- EventSource **auto-reconnects** on its own (native behavior + retry field); we do not hand-roll
  reconnect. During a reconnect gap the focus/visibility/online backstops still fire, so nothing is
  missed.
- **Coalescing** uses a leading-guard + trailing fire so a rapid burst (e.g. a multi-note push fanned
  out as several pokes) collapses to one pull. A pull already in flight when a new poke arrives is
  handled by spec 16's puller being safe to call again after settle (this module just re-schedules).
- **Teardown:** the mount hook closes the EventSource and removes all listeners on unmount so a
  flag-flip or route teardown leaves no dangling stream.

The `poke` frame is validated against `pokeEventSchema` (imported from `@yapper/schemas`) if the
handler reads `data`; since the poke is a pure trigger, reading `data` is optional, but the schema is
the shared contract that keeps both ends honest and is asserted in tests.

---

## TDD — failing goal-state tests to write first

Per the house TDD rule, write these red first; the slice is done only when green + `tsc --noEmit`
clean + Biome clean.

**API (`apps/api`, `bun test` + supertest, run from `apps/api`):**
1. **Poke published to the affected audience on a mutation.** With a note owned by user A shared
   (active collaborator user B) and an unrelated user C: perform a mutation that touches the note
   (drive it through the push path once spec 19 lands, or call `publishPokes` with the resolved
   audience directly at this spec's boundary) and assert a poke is `PUBLISH`ed to
   `poke:user:{A}` **and** `poke:user:{B}` but **not** `poke:user:{C}`. Use a fake/mock
   `RedisPublisher` capturing `(channel, payload)` pairs (mirrors how revoke tests assert channels);
   this keeps the test Redis-free.
2. **`pokeChannel(userId)` returns `poke:user:{userId}`** (pure unit) and `publishPokes` **dedupes**
   a user id that owns and collaborates on two touched notes (one publish per user).
3. **Stream endpoint auth + shape (optional, if SSE is exercised in-process):** `GET /api/sync/stream`
   without a session → `401`; with the fake `x-test-user-id` resolver → `200` with
   `Content-Type: text/event-stream`. (Full pipe delivery is covered by the client test; SSE
   streaming over supertest is awkward — keep this one to headers/status.)

**Client (`apps/web`, Vitest, run from `apps/web` with `--maxWorkers=1`):**
4. **EventSource message coalesces into one pull.** Mount `useSyncPoke()` with a mocked `EventSource`
   and a mocked `pull` (spec 16). Dispatch **three** `poke` events within the coalescing window and
   assert `pull` is called **exactly once**. Advance fake timers past the window and dispatch one more
   → `pull` called a second time. (Uses `vi.useFakeTimers()`.)
5. **Backstops fire a pull.** With the same harness, dispatching `window` `focus`, a
   `visibilitychange` to visible, and `online` each schedules a coalesced pull — even when the mocked
   EventSource is in a closed/erroring state (proves backstops are independent of SSE).
6. **Flag-gated.** With `isSyncEngineEnabled()` false, `useSyncPoke()` opens **no** EventSource and
   registers **no** listeners (spy on the `EventSource` constructor / `addEventListener`).

---

## Dependencies (build order)

ADR/spec number ≠ build order. Per the engine map, **17 builds late: 14 → 15 → 18 → 19 → 16 → 21 →
17 → 20.** This spec depends on:
- **Spec 14 (sync-foundations):** the `apps/api/src/sync/router.ts` scaffold + mount, the
  `@yapper/schemas` `sync.ts` module (where `pokeEventSchema` is added), and
  `apps/web/lib/sync/flag.ts` (`isSyncEngineEnabled()`).
- **Spec 16 (cvr-delta-pull):** the client `pull()` the poke triggers, and the `POST /api/sync/pull`
  it drives. Poke is meaningless without a puller.
- **Spec 19 (named-mutators):** the push path that, after commit, knows which notes were touched and
  calls `publishPokes`. This spec provides the helper; spec 19 provides the call site. (This is why 17
  builds after 19/16.)

This spec is **not** on the critical path for the engine's read/write correctness — with 17 unbuilt,
the engine still works via focus/interval pulls; 17 makes cross-device/collaborator propagation feel
instant. Ship it once 16 + 19 exist.

## Cross-cutting rules

- **Everything behind `NEXT_PUBLIC_SYNC_ENGINE`.** No EventSource opens and no client backstops
  register when the flag is off; the old TanStack Query notes path is untouched. The server endpoint
  can exist unconditionally (it is inert without a client connecting), but keep it inside the
  flag-gated engine surface.
- **Contracts in `@yapper/schemas`.** `pokeEventSchema` is defined once and imported by web + api;
  never duplicate the frame shape. Derive the type with `z.infer`.
- **Permissions stay server-authoritative.** The affected audience is computed server-side via
  `@yapper/permissions` (owner + active collaborators) — the same source REST/socket use. A poke is
  best-effort and carries no data, so it is **never a trust boundary**: even a spurious poke only
  causes an authoritative pull, which re-checks permissions.
- **Reuse the existing fanout pattern.** Mirror `apps/socket/src/revoke.ts` (`IORedis` subscriber,
  `psubscribe`/`subscribe` + message handler) and `apps/api/src/redis.ts` (`redisPublisher`,
  null-tolerant). Do not introduce a second Redis abstraction.
- **Null-Redis tolerance.** Every publish is optional-chained; the subscriber factory returns `null`
  when `REDIS_URL` is unset. Dev single-instance and all tests run Redis-free.
- **No `as any`.** Strict TS; match Biome style (2-space, double quotes, 100 cols).
- **Realtime co-editing untouched.** Hocuspocus cursors/presence and the made-private kick are a
  separate concern on a separate app; this spec adds a *user-scoped* channel that does not touch the
  *note-scoped* revoke/role channels.

## Risks / notes

- **One SSE per tab.** Each active tab holds one long-lived SSE connection. Acceptable at Yapper's
  scale (ADR-0005); if connection count becomes a concern, share one stream across tabs via
  `BroadcastChannel` + leader election (future-work) — no protocol change required.
- **Reconnect gaps.** While an EventSource is reconnecting, pokes published in that window are lost
  (SSE has no server-side buffer here). Covered by the always-on focus/visibility/online backstops and
  by the CVR pull being authoritative — a missed poke only delays a pull, never corrupts state.
- **SSE behind proxies / buffering.** Some proxies buffer or time out streamed responses. Mitigations:
  `Cache-Control: no-transform`, periodic heartbeat comments, and — if SSE proves operationally
  awkward — the documented fallback to **focus + interval polling with no protocol change** (the poke
  is purely a trigger; the puller and CVR are unchanged). This is a config/ops fallback, not a code
  fork.
- **Heartbeat vs. idle-timeout tuning.** The heartbeat interval must be shorter than the shortest
  proxy idle timeout in the deploy path; see decisions.md for the chosen value and the reasoning.
- **Poke storms.** A large multi-note push could fan out many pokes to a very active collaborator.
  Coalescing on the client (one pull per window) bounds *client* work; server publish volume is
  bounded by audience size and deduped per push (spec 19 unions audiences before publishing). If
  server publish volume ever matters, batch by user id — but that is premature now.
- **Connection leak safety.** The endpoint's `req.on("close")` cleanup (quit subscriber + clear
  heartbeat) is the single most important correctness detail; a missed cleanup leaks a Redis
  connection per abandoned stream. It is covered implicitly by the close handler and should be
  eyeballed in review (hard to unit-test over supertest).
