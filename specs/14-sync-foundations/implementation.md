# 14 · Sync Foundations — Implementation

## Status: complete

## Completed

All five build-order slices, each TDD (failing goal-state test first, then green + `tsc --noEmit` +
Biome). Everything is gated by `NEXT_PUBLIC_SYNC_ENGINE`; flag off = today's app, unchanged.

1. **Feature flag** — `apps/web/lib/sync/flag.ts` `isSyncEngineEnabled()`, the single reader of the
   env var; `false` unless `NEXT_PUBLIC_SYNC_ENGINE === "1"`. Test `flag.test.ts`. (Goal #1–2)
2. **Contracts** — `packages/schemas/src/sync.ts`: `noteMetaSchema`/`NoteMeta`, `mutationNameSchema`
   (14 names) + `mutationSchema` (discriminated union) + `Mutation`, `pushRequest`/`pushResponse`
   (`pushVerdictSchema` per-mutation verdict), `pullRequest`/`pullResponse`, `pokeEventSchema` — each
   with its `z.infer` type; re-exported from `index.ts`; reuse `noteAccessSchema`/`labelColorSchema`.
   Test `sync.test.ts` (18 cases): round-trip per arg-family, reject bogus name. (Goal #4–6)
3. **Dexie module** — added `dexie` (dep) + `fake-indexeddb` (dev) to `apps/web`.
   `apps/web/lib/sync/db.ts`: `yapper-sync` DB, 5 tables/indexes, row types (`BaseRow`=`NoteMeta`,
   `MutationRow`, `SyncRow`, minimal `NoteRow`/`LabelRow` "extended by 15"), `getClientGroupID()`,
   `rebuild()` throwing stub. Test `db.test.ts` (fake-indexeddb): schema present; `getClientGroupID`
   idempotent; `rebuild` export throws not-implemented. (Goal #7–9)
4. **Provider seam** — `apps/web/lib/sync/provider.tsx` `<SyncEngineProvider>`: pass-through when off,
   Dexie open + `clientGroupID` on mount when on. Mounted in `app/providers.tsx` inside
   `QueryClientProvider`. Test `provider.test.tsx`: no-op when off, opens db + resolves id when on.
   (Goal #10–11)
5. **Flag-off parity** — `app/providers.test.tsx` renders the real `<Providers>` with the flag unset:
   the tree renders and Dexie stays closed. `tsc --noEmit` clean in `apps/web` + `packages/schemas`
   (only pre-existing `common.test.ts` error remains, untouched), Biome clean, no `as any`. (Goal
   #2, #13)

Retirement/cutover is documentation only in this spec (see design.md *Retirement & cutover*) — no old
code deleted here.

## In Progress

(none)

## Blocked

(none)

## Session Notes

### 2026-07-07
- Built all 5 slices TDD on branch `feat/sync-foundations`. All sync tests green (web: 10, schemas
  sync: 18). Web + schemas type-check clean for the new files; Biome clean; no `as any`.
- **Test runner gotcha:** `bunx vitest run --maxWorkers=1` errors with "minThreads/maxThreads must
  not conflict" on this setup — use `--no-file-parallelism` instead to run the web suite serially.
- **Dexie in jsdom:** `import "fake-indexeddb/auto"` at the top of the sync test files (test-scoped,
  not in the app bundle). Don't close/delete the Dexie db in `afterEach` while the provider's
  in-flight `getClientGroupID()` is running — it surfaces a `DatabaseClosedError` unhandled rejection.
- **`z.uuid()` (zod v4)** enforces RFC version/variant bits; `crypto.randomUUID()` (v4) passes, but a
  placeholder like `1111…1111` does not — use a valid v4 UUID in tests.
- **next-themes** reads `window.matchMedia`, absent in jsdom — the full-`Providers` parity test shims
  it via `vi.stubGlobal`.
- Pre-existing (not mine): `packages/schemas/src/common.test.ts:19` fails `tsc --noEmit`. Left as-is
  per surgical-changes rule.
