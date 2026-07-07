# 19 · Named, Asymmetric Mutators Implementation

## Status: done

Goal state reached on branch `feat/named-mutators`. All 14 named mutators (client + server), the push
protocol, and the flag-gated action wiring are landed and green: api 41 tests, web 105 tests, schemas 56,
permissions 12, db 5; `tsc --noEmit` clean (web + api); Biome clean on all changed files. Everything
stays behind `NEXT_PUBLIC_SYNC_ENGINE` (off in prod until the 16 → 21 → 17 → 20 sequence completes).

## Completed

1. **Service extraction (pure refactor):** lifecycle/share/private note writes + label writes lifted
   into `apps/api/src/notes/service.ts` + `labels/service.ts` (executor-parameterized); routes call them,
   existing tests stay green.
2. **DB:** `note.meta_version` (bigint, default 0) + `sync_client` table + migration `0003`.
3. **`apps/api/src/sync/mutators.ts`:** 14 server mutators keyed from `mutationSchema`, `MutationRejected`
   (forbidden|invalid|conflict|not_found), `bumpMetaVersion`, type-safe `applyServerMutation` dispatch.
   Added `not_found` to `pushVerdictSchema.reason` (additive) + `pokeUserChannel` to `@yapper/permissions`.
4. **`apps/api/src/sync/push.ts` + `router.ts`:** ordered/transactional/idempotent apply loop, per-mutation
   verdicts, post-commit side effects + poke, `clientGroupID`↔user binding. Mounted at `/api/sync/push`.
   Tests: ordering, idempotency, verdicts (forbidden/conflict/mixed/5xx-transient), make-private.
5. **`apps/web/lib/sync/mutators.ts`:** 14 pure client mutators; extended spec-15 `rebuild()` draft to a
   `WorkingSet { notes, labels }` so label create/rename/delete show optimistically. Tests: completeness,
   purity, replay+rollback.
6. **`apps/web/lib/sync/mutate.ts` + `push.ts`:** `enqueue` + 14 per-action helpers; single-in-flight
   pusher dropping rejected seqs (rollback) with the spec-21 outcome seam. Tests: enqueue+rebuild+nudge,
   pusher reject-drop / transient-keep / applied-keep.
7. **Action wiring:** dashboard/label-editor/share-dialog route through `lib/sync/actions.ts` when the flag
   is on (all 14 flip together); Undo = queued inverse; `useLabelList` adapter; provider registers client
   mutators before any leftover-queue rebuild.

## In Progress

## Blocked

- Depends on **spec 14** (flag, `@yapper/schemas` sync contracts, Dexie `db.mutations`/`db.base`/
  `db.sync`, `getClientGroupID()`, `<SyncEngineProvider>` seam, `rebuild()` symbol), **spec 15** (the
  `rebuild()` body that folds the client mutators + the `useLiveQuery` selectors the UI reads), and
  **spec 18** (the `createNote({id})` client-minted-id + idempotent-create contract).

Build order: **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20.** Spec 19 introduces the shared `note.meta_version`
+ `sync_client` (it builds before spec 16, which consumes them). It unblocks spec 16 (reads
`meta_version` + `lastMutationID`), spec 21 (classifier plugs into `push.ts`; finalizes reason codes),
and spec 17 (delivers the pokes `push.ts` publishes).

## Next Steps

1. **Service extraction (pure refactor, own step):** lift inline lifecycle/share/label bodies from
   `apps/api/src/notes/router.ts` + `labels/router.ts` into callable service functions; existing
   `router.test.ts`/`private.test.ts` stay green.
2. `packages/db`: add `note.meta_version` (bigint, default 0) + `sync_client` table + migration.
3. `apps/api/src/sync/mutators.ts` — 14 server mutators + `MutationRejected` + `bumpMetaVersion`
   (tests first: verdicts, make-private side effects).
4. `apps/api/src/sync/push.ts` + `router.ts` — ordered/transactional/idempotent apply loop + reason
   mapping; mount `POST /api/sync/push` (tests first: ordering, idempotency, verdicts, make-private).
5. `apps/web/lib/sync/mutators.ts` — 14 pure client mutators (tests first: completeness + purity).
6. `apps/web/lib/sync/mutate.ts` (`enqueue` + per-action helpers) + `push.ts` (pusher, outcome seam for
   spec 21). Tests first (enqueue → row + rebuild + nudge; replay/rollback with spec 15's `rebuild`).
7. Route the dashboard/editor action handlers through `mutate.ts` when the flag is on; keep Undo as a
   queued inverse mutation.
8. Green + `tsc --noEmit` clean (web + api) + Biome clean. api from `apps/api` (`bun test`); web from
   `apps/web` (`--maxWorkers=1`, `fake-indexeddb`).

## Session Notes

- **Contract gap resolved:** spec-14's `pushVerdictSchema.reason` only had 3 reasons; the design needs
  4. Added `not_found` **additively** (schema header permits additive extension; existing test only
  asserts unknown reasons are rejected).
- **WorkingSet vs spec-15's notes-only draft:** the design's `WorkingSet { notes, labels }` required
  extending spec-15's `rebuild()` draft (it shipped notes-only). Threaded labels through the fold and
  now materialize `db.labels` too; updated 2 spec-15 `db.test.ts` assertions accordingly.
- **Share URL under the flag:** the capability URL isn't returned by `/push` (it rides the CVR pull,
  spec 16, and `noteMetaSchema` has no `shareToken`). Flag-on `setShareLevel` is optimistic access-only;
  URL display is deferred (acceptable — flag-on is non-functional until spec 16 fills `db.base`).
- **Repo test gotchas hit:** (1) an orphaned `old-token-abc` note from an interrupted `private.test.ts`
  run blocked the api suite — deleted the leftover rows. (2) Neon latency trips the 5s default; run api
  tests with `--timeout 30000`. (3) `bunx vitest run --maxWorkers=1` **errors** in this vitest
  (`minThreads/maxThreads conflict`); use `--no-file-parallelism` for isolated, low-memory runs
  (`singleFork` leaks `vi.mock`/Dexie state across files — caused a false provider-test failure).
