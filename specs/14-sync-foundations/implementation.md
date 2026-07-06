# 14 · Sync Foundations — Implementation

## Status: not-started

## Completed

## In Progress

## Blocked

## Next Steps

Build order (each TDD — failing goal-state test first, then green + `tsc --noEmit` + Biome):

1. **Feature flag.** `apps/web/lib/sync/flag.ts` → `isSyncEngineEnabled()`. Test: returns `false`
   unless `NEXT_PUBLIC_SYNC_ENGINE === "1"`; it's the only reader of the env var. (Goal #1–2)
2. **Contracts.** `packages/schemas/src/sync.ts`: `noteMetaSchema`/`NoteMeta`, `mutationSchema`
   (14-name discriminated union) + `mutationNameSchema`, `pushRequestSchema`/`pushResponseSchema`
   (per-mutation verdict), `pullRequestSchema`/`pullResponseSchema`, `pokeEventSchema`. Re-export from
   `index.ts`. Reuse `noteAccessSchema`/`labelColorSchema` from `./common`. Test (`sync.test.ts`):
   round-trip parse per arg-family, reject a bogus mutation name. (Goal #4–6)
3. **Dexie module.** Add `dexie` to `apps/web/package.json`. `apps/web/lib/sync/db.ts`: `yapper-sync`
   DB, 5 tables/indexes, row types, `getClientGroupID()`, `rebuild()` throwing stub. Test
   (`db.test.ts`, with `fake-indexeddb`): schema present; `getClientGroupID()` idempotent across
   calls; `rebuild` export exists with the documented signature. (Goal #7–9)
4. **Provider seam.** `apps/web/lib/sync/provider.tsx`: `<SyncEngineProvider>` (pass-through when off;
   Dexie open + `clientGroupID` when on). Mount it in `app/providers.tsx` inside `QueryClientProvider`.
   Test: no-op when flag off (no Dexie open, no error); opens db when on. (Goal #10–11)
5. **Verify flag-off parity.** A test that the dashboard mounts unchanged with the flag unset; confirm
   `tsc --noEmit` clean in `apps/web` + `packages/schemas`, Biome clean, no `as any`. (Goal #2, #13)

Retirement/cutover is **documentation only** in this spec (design.md) — no old code deleted here.

## Session Notes
