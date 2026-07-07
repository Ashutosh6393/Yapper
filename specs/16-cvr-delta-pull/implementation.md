# 16 · CVR Delta Pull Implementation

## Status: done

## Completed

- **DB** — `packages/db/src/schema.ts`: added the `syncCvr` table (`client_group_id` uuid + `cookie`
  bigint PK, `snapshot` jsonb `Record<string, number>`, `created_at`; `sync_cvr_client_group_idx`).
  `note.meta_version` + `sync_client` already existed (spec 19). Migration
  `drizzle/0004_massive_chameleon.sql` generated and applied to Neon.
- **Schemas** — `packages/schemas/src/sync.ts`: additive `reset: z.boolean().optional()` on
  `pullResponseSchema` (no renames). Test in `sync.test.ts`.
- **API** — `apps/api/src/sync/cvr.ts` (unit-testable helpers: `authorizedNotes` = set form of
  `effectivePermission != "none"`, `readCvr` with `matched` flag, server-authoritative `nextCookie`,
  `writeCvr`, `pruneOldCookies`, `diffView`, `snapshotOf`) + `apps/api/src/sync/pull.ts`
  (`handlePull`, one txn: view → diff prev → issue cookie → store snapshot → prune → echo
  `lastMutationID`). Wired `POST /pull` into `router.ts`. 8 goal-state tests in `pull.test.ts`
  (first/delta/new-row, make-private / revoke / hard-delete removals, full-resync, `lastMutationID`
  echo) — all green.
- **Web** — `apps/web/lib/sync/pull.ts`: reads clientGroupID+cookie from `db.sync`, POSTs
  `/api/sync/pull`, applies delta to `db.base` only (bulkPut/bulkDelete + reset orphan sweep), stores
  `cookie`/`lastMutationID`, drops `seq <= lastMutationID`, then `rebuild()`. 6 tests in
  `pull.test.ts` — all green. Transient failure = no-op (leaves local state intact).

Verify: `tsc --noEmit` clean in api/web/db; Biome clean on all changed files. (Pre-existing unrelated
`packages/schemas/src/common.test.ts` TS error exists on the branch base — not touched by this spec.)

## In Progress

## Blocked

- Depends on **spec 14** (contracts `pullRequestSchema`/`pullResponseSchema`/`NoteMeta`, Dexie schema,
  `rebuild()` seam, `getClientGroupID()`, flag), **spec 15** (the `rebuild()` body the puller calls),
  and **spec 19** (`sync_client.last_mutation_id` read here; the server mutators that **bump**
  `meta_version` — without the bumps, `puts` never fires for changed rows). Build 19 before 16.

Build order: **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20.** Spec 16 unblocks spec 17 (poke triggers
`pull()`) and feeds spec 21 (`lastMutationID` confirms/drops pushed mutations).

## Next Steps

1. `packages/db`: add `note.meta_version` (bigint, default 0) + the `sync_cvr` table; generate the
   migration under `packages/db/drizzle/`.
2. `apps/api/src/sync/cvr.ts` — CVR read/write + cookie helpers (unit-testable, out of the handler).
3. `apps/api/src/sync/router.ts` — the `pull` handler: `authorizedNotes` set query, CVR diff, cookie
   issue + snapshot store; mount at `/api/sync` in `app.ts`. Tests first (puts/dels/removal cases,
   full-resync, `lastMutationID` echo).
4. `packages/schemas/src/sync.ts` — additive `reset?: boolean` on `pullResponseSchema` + barrel.
5. `apps/web/lib/sync/pull.ts` — the client puller (apply puts/dels to `db.base`, reset orphan sweep,
   store cookie/`lastMutationID`, drop confirmed mutations, `rebuild()`). Tests first (apply, del→gone,
   confirmed-drop, reset missing-as-delete).
6. Fulfil spec 15's bootstrap `pull()` seam.
7. Green + `tsc --noEmit` clean (api/web/db/schemas) + Biome clean. api tests from `apps/api`; web tests
   from `apps/web` with `--maxWorkers=1` + `fake-indexeddb`.

## Session Notes

- Deviated from the design's `nextCookie = (cookie ?? maxForGroup ?? 0) + 1` to a
  **server-authoritative** `nextCookie = (maxForGroup ?? 0) + 1`: the client-sent cookie only selects
  `prev` (the diff base), never the next number. Same monotonic/opaque/unknown→resync guarantees, but
  it can never collide with an existing row nor be steered by a client-supplied number.
- `reset` is `!matched` from `readCvr` (cookie null / non-numeric / unknown / pruned), **not**
  `prev === {}` — a valid cookie for a client with zero authorized notes is up-to-date, not a resync.
- Ran web tests with `bunx vitest run --no-file-parallelism` (single file); `--maxWorkers=1` throws a
  minThreads/maxThreads conflict in this vitest 2.1.9. Full-suite OOM guidance still applies.
- Not committed — awaiting user go-ahead.
