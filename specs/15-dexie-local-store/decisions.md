# 15 · Dexie Local Store — Decisions

The umbrella rationale is `docs/adr/0003-dexie-local-source-of-truth-base-queue-materialize.md` (and
ADR-0002). This file records only the **spec-local** choices spec 15 makes.

## ADR-001: Full recompute (clear + bulkPut), not incremental diff

### Context

`rebuild()` must refresh the materialized `db.notes` from `db.base` + `db.mutations`. It could either
recompute the whole table or diff and patch only changed rows.

### Options Considered

1. **Full recompute** — seed a draft from base, fold the queue, `db.notes.clear()` + `bulkPut`.
   O(notes + mutations) each call; trivially deterministic and idempotent.
2. **Incremental diff** — track which rows a mutation touches and patch only those. Fewer writes, but
   stateful, order-sensitive, and a determinism hazard (a missed invalidation = silent drift).

### Decision

Full recompute. Note-metadata is small (hundreds of rows, ADR-0003); the recompute is cheap, and the
clear + `bulkPut` guarantees `rebuild()` is a pure, idempotent function of `(base, mutations, labels)`
— which is exactly the property the rollback primitive (spec 21) and the replay tests rely on.

### Consequences

- Re-running `rebuild()` is a no-op on the result (goal #3) — no duplicates, no drift.
- `db.notes` is fully disposable/rebuildable, so the `db.version(2)` index add needs no data migration.
- Resist "optimizing" into a diff later; at this cardinality it buys nothing and risks correctness.

## ADR-002: Flag-gated adapters, not per-call-site branches

### Context

Both the Query read path (flag off) and the Dexie read path (flag on) must coexist during migration
without scattering `if (isSyncEngineEnabled())` through every component.

### Decision

`reads.ts` exports thin adapters (`useNoteList`, `useNoteDetail`) that choose the source **once** on the
stable flag and normalize to the `{ notes, loading }` shape the pages already use. Pages swap their
`useNotes`/`useNote` calls for the adapters and are otherwise untouched.

### Consequences

- The conditional-hook branch is safe because `isSyncEngineEnabled()` is constant for the process
  lifetime (same rationale as spec 14's `<SyncEngineProvider>`); the branch never flips mid-session.
- Call sites stay path-agnostic; the eventual cutover deletes the Query arm of the adapter, not edits
  across every component.

## ADR-003: Shared-with-me stays on Query until spec 16 adds an owner field

### Context

The four owned views map cleanly onto `NoteMeta.lifecycle` + `labelIds`. The Shared-with-me view needs
`ownerName` + an owner flag, which `NoteMeta` (deliberately owner-agnostic, spec 14) does not carry.

### Decision

Keep the Shared read on today's `useSharedNotes` Query path in **both** flag states for now; record that
serving it locally requires an **additive `owner` field on the CVR base rows, owned by spec 16**. Do not
bake a rendering concern (owner name) into the wire contract from spec 15.

### Consequences

- No premature contract change; spec 16 adds the additive field when it builds the pull.
- The `useNoteList` adapter routes `isShared` to Query regardless of the flag until then — a documented
  gap, not an accidental omission.

## ADR-004: `LocalNote`/`LocalLabel` are local types, not wire schemas

### Context

The materialized `db.notes` row carries resolved label **chips**; the wire `NoteMeta` carries label
**ids** only.

### Decision

Define `LocalNote extends NoteMeta { labels: LabelChip[] }` and `LocalLabel` as **local** TS interfaces
in `lib/sync/db.ts`, not in `@yapper/schemas`. Chip resolution is a client rendering concern (ADR-0003).

### Consequences

- The wire contract stays server-authoritative and label-ids-only; chips never travel the network.
- `LocalNote` is a superset of `NoteSummary`, so the existing cards consume it with no prop-type change.

## ADR-005: `useNoteList` is owned-only; the dashboard keeps its own `useSharedNotes`

### Context

The design sketches `useNoteList(filter, labelId, isShared)` replacing **both** the dashboard's owned
(`useNotes`) and shared (`useSharedNotes`) reads, routing `isShared` to Query in both flag states
(ADR-003). But the dashboard also needs the shared list independently to build the `ownerName` map, and
`SharedNoteSummary.ownerName` is not on the normalized `{ notes }` return — folding shared into the
adapter would force the return type wider (to carry `ownerName`) just to unfold it again in the page.

### Decision

`useNoteList(filter, labelId, enabled)` is **owned-only** (flag-gated: `db.notes` on, `useNotes` off),
where `enabled` mirrors today's `!isShared`. The dashboard keeps `useSharedNotes()` untouched for the
Shared list + `ownerName` map. This still honors ADR-003 (Shared stays on Query in both flag states) —
it just leaves the Shared read where it already is instead of proxying it through the adapter.

### Consequences

- Minimal dashboard diff: only the owned read swaps; `{ notes, loading }` stays `NoteSummary`-shaped and
  the `ownerName` derivation is unchanged.
- When spec 16 adds the owner field to base rows, the Shared read can move onto a Dexie selector then;
  nothing here blocks that.

## ADR-006: `LocalNote.isOwner` is optional, `undefined` until spec 16

### Context

The note page (`app/notes/[id]/page.tsx`) reads `note.isOwner` to gate owner controls. `useNoteDetail`
returns `NoteMetadata | LocalNote | undefined`; `NoteMetadata` has `isOwner?`, but `LocalNote` (from the
owner-agnostic `NoteMeta`) has no owner marker, so the union member access wouldn't type-check.

### Decision

Add `isOwner?: boolean` to the `LocalNote` interface (a local rendering type, not the wire `NoteMeta`).
It stays `undefined` in materialization until the puller carries owner info on base rows (spec 16), so
under the flag the owner controls simply don't show yet — correct for the staged build (flag off in
prod). This keeps `useNoteDetail`'s union typing clean and forward-compatible with spec 16.

### Consequences

- The note page compiles against one adapter for both flag states; no `as any`, no per-branch typing.
- Spec 16 populates `isOwner` (via an additive owner field on base rows); the note page needs no change.
