# 21 · Rollback UX Implementation

## Status: done

## Completed

- **Schemas** — `packages/schemas/src/sync.ts`: finalized `pushRejectReasonSchema =
  z.enum(["forbidden","invalid","conflict","not_found"])` + exported `PushRejectReason`; the
  `pushVerdictSchema.reason` now references it (barrel already `export *`). Test in `sync.test.ts`.
  Deduped the literal in `apps/api/src/sync/mutators.ts` (`MutationRejected.reason: PushRejectReason`).
- **Web classifier** — `apps/web/lib/sync/classify.ts`: `PushTransportError` + `classifyPushOutcome()`
  (thrown transport error → `transient`; a `200` body → `settled` with only the rejected `{seq, reason}`).
  Tests in `classify.test.ts`.
- **Web backoff** — `apps/web/lib/sync/backoff.ts`: `nextBackoffDelay()` (1s→2s→4s… cap 30s, ±20%
  jitter) + a single-timer retry scheduler that doesn't spin while offline and resets + fires
  immediately on `online`/`focus`. Fake-timer tests in `backoff.test.ts`.
- **Web copy** — `apps/web/lib/sync/reject-copy.ts`: `ACTION_PHRASE` (all 14 names) + `rejectToastCopy()`
  (forbidden/not_found specific, else generic). Completeness test in `reject-copy.test.ts`.
- **Wiring** — `apps/web/lib/sync/push.ts`: transient → `scheduleRetry` + keep queue + silent; settled →
  `resetBackoff`, drop rejected seqs, `rebuild()`, `toast.error(rejectToastCopy(name, reason))` via the
  `@/components/ui/sonner` seam. Integration tests in `push.rollback.test.ts` (permanent revert+toast,
  transient keep+retry+silent, idempotent applied, rejected Undo, queue-no-wedge). Updated the spec-19
  `push.test.ts` afterEach to cancel the now-real backoff timer.

**Server side was already delivered by spec 19** — the push handler maps `MutationRejected` → reason-coded
verdicts, advances `lastMutationID` without applying, and 5xx's on unexpected errors; `push.verdicts.test.ts`
already covers goal-state #2/#3/#4/#7 server behavior (forbidden/conflict verdict + pointer advanced +
not applied; valid sibling applied; unexpected → 5xx, no partial verdicts). So no redundant
`push.rollback.test.ts` was added on the api side — only the reason-enum finalize.

Verify: `tsc --noEmit` clean in web/api/schemas (pre-existing unrelated `common.test.ts` error aside);
Biome clean on changed files (the 2 remaining `noConfusingVoidType` warnings are pre-existing spec-19
`mutators.ts` lines). Web tests: 21 pass across the 5 sync files; api mutators/verdicts: 4 pass.

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

- **The verdict shape carries `seq`+`reason`, not `name`.** The design's classifier pseudocode assumed
  `m.name` on the response; the real `pushVerdictSchema` (spec 14/19) has only `{seq, status, reason?}`.
  So `classifyPushOutcome` returns `{seq, reason}` and the pusher resolves the mutation **name** from its
  own pending queue (seq→name map) when composing the toast. No server/contract change needed.
- **Server error→reasonCode mapping was already done by spec 19** (see above) — spec 21's api work
  reduced to finalizing the shared reason enum. Avoided a duplicate `push.rollback.test.ts` on the api.
- **Pusher already dropped rejected seqs** (spec 19); spec 21 added the toast + backoff-on-transient and
  routed everything through `classifyPushOutcome`. The spec-19 `outcomeHandler` seam is preserved.
- **Backoff scheduler is a real timer** — the spec-19 `push.test.ts` now cancels it in `afterEach` so no
  timer leaks between tests. `poke`-triggered immediate retry (design) lands with spec 17; `online`+`focus`
  resets are wired now.
- Ran web tests with `bunx vitest run --no-file-parallelism` (`--maxWorkers=1` errors on this vitest —
  see project memory).
- Not committed — awaiting user go-ahead.
