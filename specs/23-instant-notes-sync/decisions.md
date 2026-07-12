# 23 · Instant, Lag-Free Notes — Decisions

## ADR-001: Enable the existing engine + fix propagation, rather than design a new lag-free path

### Context

The user reports lag on every note action and stale dashboard cards after edits, and asked to "plan
the architecture for a lag-free UI." A complete local-first sync engine (Dexie store, optimistic named
mutators, CVR delta pull, SSE poke, content lane) already exists across specs 14–21, fully tested but
gated OFF behind `NEXT_PUBLIC_SYNC_ENGINE`.

### Options Considered

1. **Enable + close gaps** — flip the flag on and fix the two metadata-propagation bugs. Reuses all of
   14–21; smallest possible diff for a lag-free UI. — *chosen.*
2. **Design a new optimistic layer** (e.g. broaden the TanStack Query optimistic updates on the
   flag-off path) — duplicates what the engine already does, leaves two data paths to maintain, and
   throws away 14–21.
3. **Keep gating, ship nothing** — no.

### Decision

Option 1. The architecture the user wants is already built; the work is to turn it on and make content
edits visible to the metadata lane.

### Consequences

- Prod switches to the local-first path. Rollback is a single env flip (flag off → byte-for-byte the
  old Query path).
- The two propagation fixes are server-only and tiny (bump `metaVersion`, publish a poke).

## ADR-002: Server poke (metaVersion + publishPokes) over client-triggered pull, and defer `onLocalDerive`

### Context

An edit's fresh title/preview must reach the dashboard. Two freshness mechanisms are available: a
server-side poke after the write, or client-side triggers (call `pull()` after a local flush; wire the
unused `ContentSync.onLocalDerive` to write derived title/preview straight to Dexie before any
round-trip).

### Options Considered

1. **Server poke on every content write** — socket save bumps `metaVersion` + `publishPokes`; REST
   `/content` `publishPokes`. One mechanism covers same-tab, cross-tab, and cross-device, for both
   shared and private notes, using helpers that already exist. — *chosen.*
2. **Client `pull()` after a private flush** — works for private notes (client owns the flush) but not
   shared notes (flush is the socket's, server-side), so it can't be the whole answer; would still need
   the socket fix. Rejected as the primary mechanism; redundant once poke exists.
3. **`onLocalDerive` optimistic local write** — updates the card *as you type* with zero round-trip.
   Nicer, but the ~1s poke→pull refresh is likely sufficient, and a direct Dexie write must avoid
   fighting the puller/rebuild. **Deferred** to a fast-follow; add only if 1s feels laggy.

### Decision

Option 1 as the correctness fix; Option 3 deferred and revisited only if measured lag warrants it.

### Consequences

- Shared-note metadata edits must bump `metaVersion` (they currently don't) — this is the actual bug
  fix, independent of pokes: without the bump the CVR diff can never surface the change.
- Pokes depend on Redis (Upstash, configured). Without it, the client focus/visibility/online
  backstops still refresh the dashboard, just less promptly.
- If deferred Option 3 is picked up: `ponytail: direct db.notes write self-heals on next rebuild;
  add an overlay table only if it flickers.`
