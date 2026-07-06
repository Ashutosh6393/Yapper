# 21 · Rollback UX Implementation

## Status: not-started

## Completed

## In Progress

## Blocked

- Depends on **spec 19** (named-mutators) for the pusher (`apps/web/lib/sync/push.ts`), the server push
  handler (`apps/api/src/sync/push.ts`), `db.mutations`, `rebuild()`, and the `applied|rejected` verdict
  shape.
- Depends on **spec 16** (cvr-delta-pull) for the pull loop that advances `lastMutationID` and drops
  **applied** mutations (spec 21 handles only rejected + transient).
- Depends on **spec 14** (sync-foundations) for the `@yapper/schemas` `pushResponseSchema` skeleton this
  spec finalizes the `reason` enum within.

Build after spec 16 in the global sequence: **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20.**

## Next Steps

1. Finalize `pushRejectReasonSchema` in `packages/schemas/src/sync.ts` + barrel re-export (write the
   parse test first).
2. `apps/web/lib/sync/classify.ts` — `classifyPushOutcome()` + `PushTransportError` type (test first:
   transient vs settled/rejected split).
3. `apps/web/lib/sync/backoff.ts` — `nextBackoffDelay()` + the retry scheduler (test first: growth/cap/
   jitter, `online`/success reset, fake timers).
4. `apps/web/lib/sync/reject-copy.ts` — `ACTION_PHRASE` + `rejectToastCopy()` (test first: forbidden/
   not_found specifics, generic fallback, table-completeness).
5. Wire into the spec-19 pusher outcome handler (`push.ts`): settled → drop rejected seqs + `rebuild()`
   + `toast.error`; transient → keep queued + schedule backoff. Integration test over a fake Dexie.
6. Server: map service errors → reason codes in `apps/api/src/sync/push.ts` (deny-by-default; unexpected
   → throw/`5xx`). Server test.
7. Green + `tsc --noEmit` clean + Biome clean (web tests from `apps/web` with `--maxWorkers=1`; api
   tests with `bun test` from `apps/api`).

## Session Notes
