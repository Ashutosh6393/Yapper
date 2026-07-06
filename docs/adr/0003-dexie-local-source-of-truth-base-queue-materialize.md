# 3. Dexie as local source of truth; base + queue + materialize

Date: 2026-07-05

## Status

Accepted. Implements the metadata lane of ADR-0002.

## Context

The metadata lane needs a durable local store the UI reads from reactively, and a way to keep **optimistic** local changes layered on top of **authoritative** server data. The core hazard: the puller writes the server's rows while the user has pending, unconfirmed mutations. A naïve write would clobber them — e.g. a user renames a note (optimistic), a pull arrives with the still-old title, and the rename flickers away even though it's still queued.

Note-metadata is small (hundreds of tiny records per user), which makes a fully local, materialized model cheap.

## Decision

**Store:** IndexedDB via **Dexie**, with reactive reads through **`useLiveQuery`** (`dexie-react-hooks`). IndexedDB *is* the source of truth; there is no separate in-memory mirror and no TanStack Query for notes.

**Three tables**, following the Replicache "confirmed base + pending queue → materialized view" model:

- `db.base` — authoritative rows. **Only the puller writes this** (ADR-0004).
- `db.mutations` — the pending local mutation queue (append on every user action; ADR-0007). Only the pusher removes entries (on confirm/reject).
- `db.notes` — the **materialized** view the UI reads via `useLiveQuery`. Derived, never written by hand.

A single **`rebuild()`** function recomputes `db.notes = replay(pending mutations) over db.base` and runs after **every** local mutation and **every** pull. Because the optimistic effect lives entirely in the replayed queue, rollback is automatic: when a mutation leaves the queue (confirmed *or* rejected), the next `rebuild()` either bakes its effect into base or makes it vanish — no manual undo logic.

Indicative schema (Dexie `version().stores()`):

```
db.version(1).stores({
  base:      "id, lifecycle, updatedAt",     // authoritative note-metadata rows
  notes:     "id, lifecycle, updatedAt",     // materialized (UI reads this)
  mutations: "++seq, id",                    // pending queue, monotonic seq = apply order
  labels:    "id",
  sync:      "key",                          // singletons: cookie, lastMutationID, clientGroupID
});
```

## Consequences

- **Rollback is free and correct**, which is exactly what a permissions app needs: a server rejection (ADR-0009) drops the mutation and `rebuild()` reverts the UI with no bespoke code.
- **`rebuild()` must be deterministic and total** — every mutation name needs a pure client apply function usable during replay (ADR-0007). Non-replayable side effects (token rotation, kicks) live only on the server.
- **Reads are async IndexedDB queries.** Fine at this scale; `useLiveQuery` returns `undefined` on first tick, so components render a cheap skeleton until hydration (one-time, then instant).
- **Cross-tab consistency** comes from Dexie's IndexedDB observation — multiple tabs of the same browser see the same `db.notes` updates. A single `clientGroupID` (ADR-0006) is shared across tabs.
- **`db.base` is the only pull target; `db.notes` is disposable** and can be rebuilt from base+queue at any time (e.g. after a schema upgrade) — a useful recovery property.
- **Schema evolution** uses Dexie versioned `stores()` + `upgrade()`; the materialized `notes` table can be dropped and rebuilt rather than migrated.
- The full note-*body* is **not** stored here — only metadata. Bodies live in the content lane (`y-indexeddb`, ADR-0008).
