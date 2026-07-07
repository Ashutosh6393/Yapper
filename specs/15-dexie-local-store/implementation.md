# 15 · Dexie Local Store Implementation

## Status: complete

## Completed

TDD throughout (failing goal-state test first, then green + `tsc --noEmit` + Biome). Everything behind
`NEXT_PUBLIC_SYNC_ENGINE`; flag off = today's TanStack Query reads, unchanged.

1. **`rebuild()` + materialized store** — `apps/web/lib/sync/db.ts`: real `rebuild()` body (seed draft
   from `db.base` → fold `db.mutations` in `seq` order via `applyClientMutation` → resolve chips from
   `db.labels`, drop unknown ids → `clear()` + `bulkPut`, all in one `rw` transaction). Added
   `db.version(2)` (`notes: "id, lifecycle, updatedAt, *labelIds"`), `LocalNote`/`LocalLabel` types, and
   the `applyClientMutation` dispatch seam + `registerClientMutator` (bodies = spec 19). `db.test.ts`:
   base-only mirror, chip-resolve + drop-unknown, seq-ordered fold, determinism/idempotence, unknown-name
   throw. (Goal #1–4)
2. **Selectors** — `apps/web/lib/sync/reads.ts`: `useLocalNotes(filter, labelId)` / `useLocalNote(id)` /
   `useLocalLabels()` via `useLiveQuery`. `reads.test.tsx`: `undefined → data` transition, lifecycle
   view, label-membership filter. (Goal #5–7)
3. **Flag-gated adapters** — `useNoteList(filter, labelId, enabled)` / `useNoteDetail(id)` in `reads.ts`
   (owned-only; Shared stays on `useSharedNotes` — see decisions ADR-005). `reads.test.tsx`: flag-off →
   Query, flag-on → `db.notes`. (Goal #8)
4. **Bootstrap** — `apps/web/lib/sync/provider.tsx`: one-shot `getClientGroupID()` → `pull()` (new
   `pull.ts` seam; spec 16 fills body) → `rebuild()`. `provider.test.tsx`: asserts that order. (Goal #9)
5. **Page swaps** — `app/dashboard/page.tsx` owned read → `useNoteList`; `app/notes/[id]/page.tsx` →
   `useNoteDetail`. No other behavior changed; full web suite (90 tests) green, incl. the standing
   flag-off dashboard test. (Goal #10–11)
6. Added `dexie-react-hooks` to `apps/web`; `fake-indexeddb/auto` imported test-scoped in the sync tests.

## Session Notes

### 2026-07-07
- Branch `feat/dexie-local-store`. New sync tests: db 9, reads 9, provider 3 (+ flag 3, spec-14
  providers parity 1). Full `apps/web` suite: **90 passed / 21 files**. `tsc --noEmit` + Biome clean;
  no `as any`.
- **Forward seams shipped:** `applyClientMutation` + `registerClientMutator` (spec 19 registers the 14
  bodies) and `pull()` in `lib/sync/pull.ts` (spec 16 implements the CVR body; benign no-op now, so
  `db.base` stays empty and the flag-on read path renders empty/skeleton — expected staged behavior).
- **Deviations (see decisions.md):** ADR-005 — `useNoteList` is owned-only, dashboard keeps its own
  `useSharedNotes` (honors ADR-003, minimal diff, avoids widening the return type for `ownerName`).
  ADR-006 — `LocalNote.isOwner?` optional, `undefined` until spec 16 supplies owner on base rows.
- **Biome gotcha:** the flag-gated adapters call hooks conditionally; Biome's recommended
  `lint/correctness/useHookAtTopLevel` flags this. It's genuinely safe (the flag is constant per
  process) and required (calling the Dexie selector unconditionally would open IndexedDB when the flag
  is off). Suppressed with single-line `// biome-ignore` directly above each hook call (a multi-line
  reason comment breaks the suppression — the directive must be the line immediately above the target).
- **Test runner:** `--maxWorkers=1` *alone* errors ("minThreads/maxThreads conflict"); use
  `--maxWorkers=1 --minWorkers=1` for the full suite or `--no-file-parallelism` for a single file.
