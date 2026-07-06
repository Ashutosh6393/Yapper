# 17 · SSE + Redis Poke Transport — Decisions

The transport decision itself — **SSE on `apps/api` + Redis fanout** over a user-scoped
`poke:user:{id}` channel, backstopped by focus/reconnect pulls, pokes best-effort — is made in
**`docs/adr/0005-sse-redis-poke-transport.md`** (and framed by ADR-0002/0004). This file records only
the **spec-local** choices ADR-0005 left open; it does not restate the ADR.

## ADR-17a: Heartbeat every 25 seconds via SSE comment frames

### Context
An idle SSE connection can be silently reaped by proxies/load balancers with a short idle timeout, and
a half-open TCP pipe is otherwise invisible to both ends until the next write. We need a keep-alive
that is cheap and requires no client handling.

### Options Considered
1. **Comment-frame heartbeat every ~25s** (`: ping\n\n`) — below the common 30–60s proxy idle
   timeout; comment frames are ignored by `EventSource` (no client code), negligible bandwidth.
2. **No heartbeat, rely on EventSource auto-reconnect** — simpler, but a connection silently dropped
   by a proxy stays "open" on the client until its next real event, widening the reconnect gap.
3. **Very frequent (≤5s) heartbeat** — detects death faster but wastes writes on every idle tab at
   scale for no real benefit given the backstops already cover gaps.

### Decision
Option 1: a `setInterval` writing `: ping\n\n` every **25s**, cleared on `req.on("close")`. Chosen to
sit safely under a 30s proxy idle timeout (the tightest we expect) while staying cheap. The value is a
single `HEARTBEAT_MS` constant so it is trivially tunable per deploy environment.

### Consequences
- Keeps the stream alive through idle-timeout proxies without any client-side handling.
- If a specific proxy uses a shorter timeout, lower the constant — no protocol change.
- Heartbeat is *not* a delivery guarantee; it only keeps the pipe open. Missed pokes are still covered
  by the backstops.

## ADR-17b: Coalesce client pokes into one pull with a ~300 ms trailing debounce

### Context
A single push can touch several notes and fan out as multiple pokes to one collaborator; EventSource
may also deliver a small burst on reconnect. Running the puller once per poke would cause redundant
`POST /api/sync/pull` round-trips for data a single pull already covers (the CVR pull returns the full
current delta regardless of how many notes changed).

### Options Considered
1. **Trailing debounce (~300 ms), leading-guard** — the first poke schedules a pull; further pokes in
   the window are absorbed; one pull fires at the trailing edge. One pull per burst; ~300 ms is below
   human-perceptible for "instant" while wide enough to swallow a fan-out burst.
2. **Pull immediately per poke** — simplest, but N pokes → N pulls; wasteful and can stampede.
3. **Fixed-interval throttle** — bounds rate but adds up-to-interval latency even for a lone poke.

### Decision
Option 1: a trailing debounce with window `COALESCE_MS = 300`. A pull already in flight is not
cancelled; a poke arriving during it simply re-schedules, and spec 16's puller is safe to run again
after settle. Same scheduler is shared by the backstops (focus/visibility/online) so they coalesce
with pokes.

### Consequences
- A burst of pokes (or backstop events) results in exactly one pull — the goal-state client test.
- Adds at most ~300 ms latency to a lone poke — imperceptible and worth the de-duplication.
- The window is a single constant, tunable if propagation feels laggy or pulls feel chatty.

## ADR-17c: One SSE per tab now; defer shared-stream leader election

### Context
ADR-0005 accepts "one long-lived SSE per active tab" at Yapper's scale and notes a future
`BroadcastChannel`/leader-election option to share a single stream across a browser's tabs. We must
decide whether to build sharing now.

### Options Considered
1. **Per-tab EventSource (no sharing)** — trivial: each tab opens its own stream, each backstops
   itself; teardown is per-tab. N tabs = N connections + N pulls on a shared change.
2. **Shared stream via `BroadcastChannel` + leader election** — one tab owns the SSE and rebroadcasts
   pokes to sibling tabs; cuts connections and duplicate pulls. Adds leader-election, failover when
   the leader tab closes, and cross-tab messaging complexity.

### Decision
Option 1 (per-tab) for this spec. The connection/pull cost is acceptable at current scale, the
per-tab code is small and self-contained in `apps/web/lib/sync/poke.ts`, and the CVR pull is
idempotent so duplicate pulls across tabs are harmless (just redundant). Sharing is deferred to
future-work.

### Consequences
- Simple, self-contained client module; no cross-tab coordination to test or debug.
- Cost scales linearly with open tabs (connections + redundant pulls) — fine now, revisit if tab-fanout
  becomes a load problem.
- The upgrade path is clean: swap the direct `EventSource` for a `BroadcastChannel`-fronted leader
  without touching the server, the channel contract, or the puller (documented in future-work.md).
