# 5. SSE + Redis fanout for sync pokes

Date: 2026-07-05

## Status

Accepted. Defines when the client pulls (ADR-0004).

## Context

After a push mutates data, the affected users need a **poke** — a lightweight "you have changes, pull now" signal — so cross-device and collaborator updates feel instant instead of waiting for a poll. The poke carries no data; it only triggers `POST /api/sync/pull`.

Yapper already runs Redis and a socket app, but Hocuspocus is **Y.Doc-scoped**; a *user*-scoped poke does not fit its model and would muddy that app's single responsibility. A poke is inherently one-way (server → client).

## Decision

Deliver pokes over **Server-Sent Events on `apps/api`, fanned out via Redis**:

- **`GET /api/sync/stream`** — an EventSource endpoint on the `api` origin, authenticated by the existing Better Auth cookie (`credentials: "include"`). On connect it subscribes to the Redis channel `poke:user:{userId}`.
- **On push**, after the server mutators commit and bump versions (ADR-0007), the server computes the affected audience for each touched note (owner + current collaborators, via `@yapper/permissions`) and `PUBLISH`es a poke to each `poke:user:{id}`.
- **Client**: a single `EventSource('/api/sync/stream')`; on message → run the puller (debounced/coalesced so a burst of pokes causes one pull).
- **Backstops** (always on, independent of SSE): pull on window `focus`/`visibilitychange` and on network `reconnect`. These also cover the window while SSE is reconnecting.

This reuses the exact fanout pattern the socket app already uses for revoke/role channels — only the channel name space (`poke:user:{id}`) and the transport to the browser (SSE vs WebSocket) are new.

## Consequences

- **Hocuspocus stays doc-scoped.** The realtime editor app is untouched; user-scoped signalling lives with the REST app that already owns mutations and Redis.
- **EventSource auto-reconnects** and rides the same cookie/origin as every other `api` call — no new auth path, no new WebSocket handshake.
- **Pokes are best-effort, not a correctness dependency.** A missed poke only delays a pull until the next focus/reconnect/poll; the CVR pull (ADR-0004) is always authoritative. This keeps the poke path simple (no delivery guarantees, no per-poke payload).
- **Connection cost**: one long-lived SSE per active tab. Acceptable at Yapper's scale; can be shared across tabs later via a `BroadcastChannel`/leader-election if needed.
- **Cross-device metadata propagation** (rename on laptop → phone updates in ~1s) works for private notes too, because the poke fans out to the owner's own other sessions, not just collaborators.
- If SSE proves operationally awkward behind proxies, the client can fall back to focus + interval polling **without any protocol change** — the poke is purely a trigger.
