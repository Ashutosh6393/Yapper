# 15 · Dexie Local Store Implementation

## Status: not-started

## Completed

## In Progress

## Blocked

- Depends on **spec 14** (sync-foundations): the Dexie `yapper-sync` schema (`base`/`notes`/`mutations`/
  `labels`/`sync`), the `rebuild()` throwing stub this spec replaces, `NoteMeta`, `getClientGroupID()`,
  and the `<SyncEngineProvider>` seam. Build spec 15 immediately after 14.

Ships two **forward seams** consumed by later specs: `applyClientMutation` (bodies filled by spec 19)
and the bootstrap's `pull()` import (implemented by spec 16). Spec 15's own tests seed `db.base`/
`db.mutations`/`db.labels` directly, so it is testable before those siblings land.

## Next Steps

1. Replace the `rebuild()` stub in `apps/web/lib/sync/db.ts` with the real replay body (test first:
   fold, base-only, determinism, chip-drop); add `db.version(2)` `notes` indexes + `LocalNote`/
   `LocalLabel` types + the `applyClientMutation` dispatch seam.
2. `apps/web/lib/sync/reads.ts` — `useLocalNotes`/`useLocalNote`/`useLocalLabels` selectors (test first:
   `undefined → data` transition).
3. The flag-gated `useNoteList`/`useNoteDetail` adapters (test first: flag-off → Query, flag-on → Dexie).
4. Extend `SyncEngineBootstrap` with the one-shot `getClientGroupID()` → `pull()` seam → `rebuild()`
   (test first: bootstrap calls puller once then `rebuild`).
5. Swap the note reads in `app/dashboard/page.tsx` + `app/notes/[id]/page.tsx` to the adapters.
6. Add `dexie-react-hooks` to `apps/web`; wire `fake-indexeddb` into the sync test setup.
7. Green + `tsc --noEmit` clean + Biome clean (web tests from `apps/web` with `--maxWorkers=1`).

## Session Notes
