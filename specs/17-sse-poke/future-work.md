# 17 · SSE + Redis Poke Transport — Future Work

Deferred deliberately; not part of this spec's goal state.

## Shared stream across tabs (BroadcastChannel leader election)
- **One SSE per browser, not per tab.** Elect a leader tab (e.g. via `BroadcastChannel` +
  `navigator.locks` or a heartbeat/claim protocol) that owns the single `EventSource` and rebroadcasts
  each poke to sibling tabs over a `BroadcastChannel`; followers run only the puller. On leader-tab
  close, a follower re-elects and opens the stream. Cuts connection count and duplicate pulls to one
  per browser (ADR-17c, ADR-0005). Upgrade is server-transparent: the channel contract, the SSE
  endpoint, and the puller are unchanged — only `apps/web/lib/sync/poke.ts` swaps its direct
  `EventSource` for a leader-fronted one.

## Transport robustness
- **Documented proxy fallback → code path.** ADR-0005's "focus + interval polling, no protocol change"
  fallback is currently an ops decision (disable/ignore SSE, lean on backstops + an interval). If SSE
  proves broadly awkward behind customer proxies, promote it to a runtime-selectable client mode
  (SSE vs poll-only) behind a flag, still with zero protocol change.
- **Last-Event-ID / replay on reconnect.** Give pokes a monotonic id and honor the `Last-Event-ID`
  header so a reconnecting client can learn it missed pokes during the gap and pull once immediately,
  tightening the reconnect-gap window beyond what the focus/online backstops give. Only worth it if
  reconnect-gap latency ever becomes user-visible.

## Fanout efficiency
- **Server-side publish batching / rate-limiting.** For very large collaborator audiences or
  high-frequency pushes, batch or throttle `publishPokes` per user so a burst of touched notes doesn't
  emit many pokes to the same very-active user (the client already coalesces receipt; this bounds the
  server/Redis side). Premature at current scale.
- **Presence-aware publishing.** Skip publishing to users with no active stream (track live
  subscribers) to cut Redis traffic. Adds presence bookkeeping; only if publish volume matters.

## Observability
- **Stream metrics.** Count open streams, heartbeat writes, pokes delivered vs. coalesced, and pull
  triggers by source (poke / focus / visibility / online) to tune `HEARTBEAT_MS` / `COALESCE_MS` and
  spot proxy-reap patterns. Not needed to ship the feature.
