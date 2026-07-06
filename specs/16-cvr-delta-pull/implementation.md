# 16 · CVR Delta Pull Implementation

## Status: not-started

## Completed

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
