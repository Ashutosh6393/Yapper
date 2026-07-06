# 16 · CVR Delta Pull — Decisions

The umbrella rationale is `docs/adr/0004-cvr-delta-pull-protocol.md` (and ADR-0002). This file records
only the **spec-local** choices spec 16 makes.

## ADR-001: CVR snapshot stored as one jsonb blob, not child rows

### Context

Each `(client_group_id, cookie)` must store the `{ noteId → metaVersion }` snapshot last sent. Two
shapes: one `jsonb` blob per row, or a `sync_cvr_entry(client_group_id, cookie, note_id, meta_version)`
child table.

### Options Considered

1. **jsonb blob** — one atomic read + one atomic write per pull; single-row prune; not SQL-indexable per
   entry.
2. **Child rows** — per-entry SQL queryability, but N-row insert/delete churn per pull and multi-row
   pruning; the queryability is unused because the diff runs in app memory.

### Decision

jsonb blob. The diff is a whole-snapshot set operation over a **bounded** set (a user's authorized
notes — tens to low hundreds), done in application memory, never a SQL join. The blob gives atomic
read/write and cheap pruning; per-entry indexing buys nothing here.

### Consequences

- The whole snapshot is read/rewritten each pull even for a one-note change — acceptable at this
  cardinality (a few KB per blob).
- Individual entries aren't SQL-indexable (not needed).

## ADR-002: Opaque monotonic cookie per client group; unknown → full resync

### Context

The cookie identifies which CVR snapshot to diff against. It must avoid clock-skew gaps and survive
pruning.

### Decision

An opaque **monotonic integer per client group**, serialized to a string on the wire, `next =
(cookie ?? maxForGroup ?? 0) + 1` computed inside the pull transaction. Prune to the latest 1–2 cookies
per group. A `null`/unknown/pruned cookie yields an empty `prev` → full resync.

### Consequences

- Never a wall-clock value → no skew gaps (ADR-0004).
- **Sequence restart after a full prune** can reuse a number — safe, because the client only ever
  *presents* a cookie for lookup; any cookie the server can't find triggers a full resync regardless of
  its numeric value (the number is never compared for ordering by the client). Documented, accepted.
- A single client group shares one `db.sync` cookie across tabs (IndexedDB origin-scoped), so the in-use
  cookie is never the one pruned.

## ADR-003: Additive `reset` flag on the pull response

### Context

On an empty `prev` (first pull / unknown / pruned cookie) the server returns the whole view as `puts`
but **cannot name** the client's now-orphaned local `db.base` rows in `dels` (it never recorded them).
Without a signal, a stale-cookie pull would silently leave removed notes in `db.base` (data corruption).

### Decision

Add `reset: z.boolean().optional()` to `pullResponseSchema` — `true` only when `prev` was empty. On
`reset`, the client deletes every local `db.base` row whose id is not in `puts` (missing-as-delete). This
is an **additive** change spec 14 explicitly permits (no field renames); a parser ignoring `reset` still
validates.

### Consequences

- Stale-cookie pulls self-heal to the server's exact view.
- The one place spec 16 extends the spec-14 envelope — additively, keeping every existing field's name
  and meaning.

## ADR-004: `authorizedNotes` as a set query, not per-note `resolvePerm`

### Context

The pull needs the caller's whole authorized view, not a single-note permission check.

### Decision

Express the permission rule as SQL (owned ∪ shared-active-not-private-not-trashed), exactly as REST's
`GET /` and `GET /shared` already do — the set form of `effectivePermission != "none"`.

### Consequences

- The list view is one/two queries, not N cache lookups, and matches the single-note gate (`resolvePerm`)
  by construction.
- If the permission derivation ever changes, the pure `effectivePermission` and this set query must move
  together — flag it in `@yapper/permissions` review.
