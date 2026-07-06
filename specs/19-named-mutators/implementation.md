# 19 · Named, Asymmetric Mutators Implementation

## Status: not-started

## Completed

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
