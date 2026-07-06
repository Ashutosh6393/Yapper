# CLAUDE.md — 15 · Dexie Local Store

## Project Context

The metadata **read path** of the local-first engine (ADR-0003), built **second** (after root spec 14).
It implements `rebuild()` — the Replicache-style `db.notes = replay(db.mutations) over db.base`
materialization — and replaces the read side of today's TanStack Query notes path with reactive Dexie
`useLiveQuery` selectors. When the flag is on, the dashboard/note page read the list / single note /
label chips from `db.notes` + `db.labels`; components render the same UI, only the data source changes.

Reads + materialization **only**. It does **not** write the mutation queue (spec 19 — here
`db.mutations` is a read-only input to `rebuild()`), does **not** implement the CVR pull (spec 16 —
the bootstrap calls spec 16's `pull()` seam), and changes no server/DB/Redis code. Behind
`NEXT_PUBLIC_SYNC_ENGINE`; flag off ⇒ today's Query reads, unchanged. `apps/web` only.

## Before Starting Work

1. Read `specs/15-dexie-local-store/design.md` (Goal State + the `rebuild()` algorithm, the selectors +
   flag-gated adapters, the bootstrap, and the Shared-view owner-gap note).
2. Read `decisions.md` (spec-local choices) and the governing ADR `docs/adr/0003-…` (+ `0002-…`).
3. Check `implementation.md` for progress / next step.
4. Look at existing patterns in:
   - `specs/14-sync-foundations/design.md` — the finalized `db.ts` (5 tables), the `rebuild()`
     **throwing stub** this spec replaces, `NoteMeta`, `getClientGroupID()`, `<SyncEngineProvider>`.
   - `apps/web/lib/queries/notes.ts` (`useNotes`/`useSharedNotes`/`useNote` — the reads being replaced;
     `noteKeys`) + `apps/web/lib/dashboard-view.ts` (`NoteFilter`, `filterForView`).
   - `apps/web/app/dashboard/page.tsx` + `app/notes/[id]/page.tsx` (the call sites that swap to the
     adapters) + `components/dashboard/{note-section,note-card,sidebar}.tsx` (consume `NoteSummary`).

## Code Patterns

- **`rebuild()` = pure, total, deterministic recompute** in a single Dexie `rw` transaction over
  `[base, mutations, labels, notes]`: seed a draft from `db.base`, fold `db.mutations` in `seq` order
  via `applyClientMutation` (the dispatch seam — bodies land in spec 19), resolve label chips from
  `db.labels`, then `db.notes.clear()` + `bulkPut`. Never diff, never read `db.notes`, no wall-clock/
  random. Re-running yields identical rows.
- **`applyClientMutation(draft, {name,args})` is a SEAM here** — spec 15 defines the signature + the
  fold; **spec 19 fills the 14 per-name bodies**. Spec 15's tests register a minimal in-test mutator to
  exercise the fold without depending on spec 19.
- **Chip resolution is a client concern** (`NoteMeta` is label-ids-only): map `labelIds` → `LabelChip[]`
  from `db.labels`; **drop** an id with no label row (best-effort, mirrors spec 13c cold-cache degrade),
  never render an id.
- **`useLiveQuery` selectors** (`reads.ts`): `useLocalNotes(filter, labelId)`, `useLocalNote(id)`,
  `useLocalLabels()`. All return `undefined` on the first tick → callers treat `undefined` as
  **loading** (skeleton), never as "empty".
- **Flag-gated adapters, not per-call-site `if`:** `useNoteList(filter, labelId, isShared)` /
  `useNoteDetail(id)` pick Dexie vs Query once on the stable flag (hook-safe because the flag is
  constant for the process). Pages swap `useNotes`/`useNote` for the adapters; everything else unchanged.
- **`db.notes` is derived — only `rebuild()` writes it.** Never write `db.base` (puller-only, spec 16)
  or `db.mutations` (queue, spec 19) from this spec.
- **`db.version(2)`** adds `notes: "id, lifecycle, updatedAt, *labelIds"` (materialized view is
  disposable, so the upgrade just triggers a `rebuild()` — no data migration).
- **No `as any`** — type Dexie tables + selector results from `@yapper/schemas` + the `LocalNote`/
  `LocalLabel` interfaces (local materialized types, not new wire shapes).

## Repo Gotchas (for the implementer)

- **jsdom has no IndexedDB.** Dexie + `useLiveQuery` tests need `fake-indexeddb` (`fake-indexeddb/auto`
  in the sync test setup, dev-only — keep out of the app bundle). Render selector tests with Testing
  Library and `await` the `undefined → data` transition.
- **`apps/web` full Vitest suite OOMs** on default parallel — run `bunx vitest run --maxWorkers=1` from
  `apps/web` (via Vitest, not raw `bun test`).

## Don't

- **Don't write the mutation queue or the 14 client-mutator bodies** — spec 19. Here `db.mutations` is a
  read-only input and `applyClientMutation` is a dispatch seam.
- **Don't implement the CVR pull** — spec 16. The bootstrap calls its `pull()` stub; `db.base` stays
  empty until 16 lands (the flag-on dashboard is empty then — expected for the staged build).
- **Don't write `db.base` or `db.notes` by hand** — `db.base` is puller-only; `db.notes` only via
  `rebuild()`. One materialization path.
- **Don't treat first-tick `undefined` as empty** — it's loading; render the skeleton or you flash "No
  notes yet" then pop the list.
- **Don't serve the Shared-with-me view from `db.notes`** — `NoteMeta` has no owner marker; keep it on
  `useSharedNotes` (both flag states) until spec 16 adds an additive `owner` field to the CVR base rows.
- **Don't add `LocalNote`/`LocalLabel` to `@yapper/schemas`** — they're local rendering types, not wire
  shapes.
- **Don't delete/edit** `lib/queries/notes.ts` behavior — the flag-off path depends on it (deletion is
  spec 19 / final cutover). Don't read the env var outside `flag.ts`.
