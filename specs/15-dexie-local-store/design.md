# 15 · Dexie Local Store — Design

Spec 14 built the local-first engine's **skeleton**: the feature flag, the `@yapper/schemas` sync
contracts, the Dexie `yapper-sync` database (five tables + `clientGroupID` bootstrap), and a
`rebuild()` **throwing stub**. This spec makes the metadata **read path** real. It implements the
`rebuild()` body — the shared primitive that recomputes `db.notes = replay(db.mutations) over db.base`
(the Replicache-style base + queue → materialize model of ADR-0003) — and replaces the read side of
today's TanStack Query notes path with reactive Dexie `useLiveQuery` selectors. When the flag is on,
the dashboard and the note page read the note list / single note / label chips from `db.notes` and
`db.labels`; the components render exactly the same UI, only the data source changes.

This spec owns **reads and materialization only**. It does not write the mutation queue (that is spec
19 — here `db.mutations` is a **read-only input** to `rebuild()`), it does not implement the CVR pull
(spec 16 — here the bootstrap calls spec 16's puller **seam** to fill `db.base`), and it changes no
server, DB, or Redis code. Everything stays behind `NEXT_PUBLIC_SYNC_ENGINE`: with the flag off (the
default, incl. prod), `apps/web` keeps its current TanStack Query notes reads untouched. In the
build-order graph this spec is **second** (after root spec 14) and unblocks 16/18/19, which all read
from or rebuild `db.notes`.

## Goal State (acceptance)

**`rebuild()` — the materialization primitive**
1. `apps/web/lib/sync/db.ts` **replaces** spec 14's throwing `rebuild()` stub with a real body that
   recomputes `db.notes = replay(db.mutations) over db.base` and resolves label chips from
   `db.labels`. It runs inside a **single Dexie `readwrite` transaction** over
   `[base, mutations, labels, notes]` so a concurrent pull or (future) queue write can't interleave a
   half-applied view. A goal-state test seeds `db.base` + a queued mutation and asserts `db.notes`
   reflects the folded result.
2. Replay is **ordered and total**: mutations are applied strictly in ascending `seq` order via a
   **client-mutator dispatch** (`applyClientMutation(draft, { name, args })`), the pure per-name apply
   seam whose 14 bodies land in **spec 19**. With an **empty queue** (the reality until spec 19 wires
   writes) `rebuild()` yields `db.notes` = a materialized mirror of `db.base` (chips resolved) — a test
   asserts this base-only case.
3. `rebuild()` is **deterministic and idempotent**: the same `base` + `mutations` always produce the
   same `db.notes`, and running `rebuild()` twice yields identical rows (it fully recomputes the table
   — clear + `bulkPut` — never diffs). A test runs `rebuild()` twice over the same inputs and asserts
   the `db.notes` snapshot is unchanged (no duplicates, no drift).
4. **Chip resolution** is a client concern here (`NoteMeta` is label-**ids**-only, ADR-0003 / spec 14):
   materialization maps each base row's `labelIds` → `LabelChip[]` by looking up `db.labels`; a
   `labelId` with no matching label row is **dropped** (best-effort, mirrors spec 13's cold-cache
   degrade), never rendered as an id. A test with a note carrying a known + an unknown label id asserts
   only the known chip materializes.

**Reactive read selectors (`useLiveQuery`)**
5. A new `apps/web/lib/sync/reads.ts` exports `useLocalNotes(filter, labelId)` — a `useLiveQuery`
   selector over `db.notes` returning the materialized rows for one owned lifecycle view
   (`active` / `archived` / `trashed`), optionally filtered to a label. Each row is **assignable to
   `NoteSummary`** (`id`, `title`, `preview`, `access`, `updatedAt`, `labels: LabelChip[]`), so
   `components/dashboard/{note-section,note-card}.tsx` consume it with **no prop-type change**.
6. `reads.ts` exports `useLocalNote(id)` (single materialized note via `db.notes.get(id)`, carrying
   `isOwner` for the owner controls on `app/notes/[id]/page.tsx`) and `useLocalLabels()` (the sidebar
   label list via `db.labels`, for `components/dashboard/sidebar.tsx`).
7. All selectors return **`undefined` on the first tick** (before Dexie resolves) and a concrete array
   / row afterwards; callers treat `undefined` as **loading** (drives the existing `NoteSection`
   `loading` skeleton). A test asserts a selector transitions `undefined → data` once `db.notes` is
   populated.
8. The read path is chosen by the **stable flag**, not by editing every call site: `reads.ts` exports
   thin adapters (`useNoteList(filter, labelId, isShared)` → `{ notes, loading }`, `useNoteDetail(id)`)
   that call the Dexie selectors when `isSyncEngineEnabled()` and the existing Query hooks
   (`useNotes` / `useNote`) otherwise. Because the flag is constant for the process lifetime, this
   branch is hook-safe (same rationale spec 14's provider relies on). `app/dashboard/page.tsx` and
   `app/notes/[id]/page.tsx` swap their `useNotes`/`useNote` calls for the adapter and are otherwise
   unchanged. A test asserts flag-off routes to Query and flag-on routes to `db.notes`.

**Bootstrap (fulfilling spec 14's seam)**
9. Spec 14's `SyncEngineBootstrap` (the flag-on branch of `<SyncEngineProvider>`) gains a **one-shot
   bootstrap**: on mount it ensures `clientGroupID` (spec 14's `getClientGroupID()`), then calls the
   **puller seam** (`pull()`, owned by spec 16) once to fill `db.base`, then calls `rebuild()`. Spec 15
   owns the **trigger + ordering**, not the CVR internals (until spec 16 lands, the puller is its stub
   and `db.base` stays empty — the read path renders an empty/skeleton state, which is correct for the
   staged build). A test asserts bootstrap calls the puller seam once then `rebuild()`.
10. **First-load skeleton:** while Dexie hydrates (`useLiveQuery` `undefined` first tick) the dashboard
    renders the existing variable-height masonry skeletons; once `db.notes` resolves the list renders
    instantly and stays reactive (cross-tab updates included, via Dexie's IndexedDB observation).

**Cross-cutting**
11. `apps/web` only. `tsc --noEmit` clean; Biome clean (2-space, double quotes, 100 cols); no `as any`.
    Goal-state tests written first (TDD) and green. With the flag **off**, the dashboard/note-page
    behave byte-for-byte as today (a standing test asserts the flag-off path still uses Query).

## Scope

**In (all `apps/web`):**
- `apps/web/lib/sync/db.ts` — implement the `rebuild()` body (replay fold + chip materialization +
  single `readwrite` transaction); **finalize the `db.notes` (materialized) row shape** and add its
  indexes (a `db.version(2)` bump — see *Materialized table* below); define the `applyClientMutation`
  **dispatch seam** (bodies owned by spec 19); define the `LocalNote` / `LocalLabel` row types.
- `apps/web/lib/sync/reads.ts` (new) — `useLocalNotes` / `useLocalNote` / `useLocalLabels` selectors +
  the flag-gated `useNoteList` / `useNoteDetail` adapters. Depends on `dexie-react-hooks`.
- `apps/web/lib/sync/provider.tsx` — extend `SyncEngineBootstrap` with the one-shot bootstrap
  (`clientGroupID` → puller seam → `rebuild()`).
- `apps/web/app/dashboard/page.tsx` + `app/notes/[id]/page.tsx` — swap the note **reads**
  (`useNotes`/`useNote`) for the adapters; **no other change** (create/seed, mutations, search,
  masonry, dialogs all stay as-is).
- Add `dexie-react-hooks` to `apps/web/package.json`.
- Tests: `db.test.ts` (extend spec 14's with `rebuild()` cases), `reads.test.tsx`, provider-bootstrap
  test — all with `fake-indexeddb`.

**Out (owned by the named sibling spec):**
- The **CVR puller** (`pull()`, `/api/sync/pull`, `note.meta_version`, `sync_cvr`, cookie/delta
  semantics) that actually fills `db.base` and `db.labels` → **spec 16**. Spec 15 calls its seam.
- The **mutation queue writes** (append on user action) and the **14 client-mutator bodies**
  (`applyClientMutation`'s per-name cases) + server mutators → **spec 19**. Here `db.mutations` is a
  read-only input and `applyClientMutation` is a dispatch seam.
- **Client-minted note ids** end-to-end + idempotent create → **spec 18**.
- **Rollback UX** (transient vs permanent classification, revert toast) → **spec 21**. Rollback is
  *mechanically* free here (drop a mutation → next `rebuild()` reverts), but the classification and
  toast are 21.
- **Content lane** (`PUT /api/notes/:id/content`, title/preview re-derivation) → **spec 20**.
- **Deleting** the retired `lib/queries/notes.ts` reads / `optimistic.ts` → **spec 19 / final cutover**,
  only when the flag flips. Spec 15 keeps both paths and touches neither Query file's behavior.
- The **Shared-with-me** view's owner marker — see *Shared view* below; needs an additive `owner`
  field on the CVR's base rows, **owned by spec 16**.

---

## `rebuild()` — replay algorithm (`apps/web/lib/sync/db.ts`)

`rebuild()` is the one primitive every local mutation (spec 19) and every pull (spec 16) calls to
refresh what the UI reads. It fully recomputes the materialized `db.notes` from authoritative base +
pending queue — no incremental diffing (the table is small, hundreds of rows; ADR-0003).

```
export async function rebuild(): Promise<void> {
  await db.transaction("rw", db.base, db.mutations, db.labels, db.notes, async () => {
    // 1. Load authoritative rows into a working map (id → NoteMeta).
    const draft = new Map<string, NoteMeta>();
    for (const row of await db.base.toArray()) draft.set(row.id, { ...row });

    // 2. Replay the pending queue in monotonic seq order (pure client mutators; bodies = spec 19).
    const queued = await db.mutations.orderBy("seq").toArray();
    for (const m of queued) applyClientMutation(draft, m); // { name, args } — dispatch seam

    // 3. Materialize: resolve label chips from db.labels; drop unknown ids (best-effort).
    const labels = new Map((await db.labels.toArray()).map((l) => [l.id, l]));
    const materialized: LocalNote[] = [...draft.values()].map((n) => ({
      ...n,
      labels: n.labelIds.flatMap((id) => {
        const l = labels.get(id);
        return l ? [{ id: l.id, name: l.name, color: l.color }] : [];
      }),
    }));

    // 4. Replace the whole materialized table (disposable; clear + bulkPut — deterministic, no drift).
    await db.notes.clear();
    await db.notes.bulkPut(materialized);
  });
}
```

- **Ordering** is by `seq` (the `mutations` auto-inc PK = apply order, spec 14). **Totality**: every
  queued mutation dispatches through `applyClientMutation`; an unknown `name` is a programmer error
  (throws) not a silent skip. **Determinism**: same inputs → same output; the clear + `bulkPut` makes
  re-running `rebuild()` a no-op on the result (goal #3).
- **`applyClientMutation(draft, mutation)`** is the pure, replayable dispatch. Spec 15 defines its
  **signature + registry seam** and the fold that drives it; **spec 19 fills the 14 per-name bodies**
  (`createNote` inserts a draft row, `renameNote` sets `title`, `archiveNote` sets
  `lifecycle: "archived"`, `applyLabel` pushes a `labelId`, etc. — pure, optimistic-local only, no
  side effects). Until spec 19, the registry is empty and the queue is empty, so the fold is a no-op
  and `rebuild()` = base → materialized mirror. Spec 15's ordering/determinism tests seed `db.mutations`
  directly and register a minimal in-test mutator to exercise the fold without depending on spec 19.
- **Transactional** so it composes safely with spec 16's pull (which writes `db.base` then calls
  `rebuild()`) and spec 19's mutate (append `db.mutations` then `rebuild()`); a `rw` transaction over
  all four tables serializes them.

### Materialized `db.notes` table (finalized here)

Spec 14 shipped `notes: "id"` and marked the row shape "finalized in spec 15". This spec finalizes it
and adds the indexes the list selector needs, via a Dexie version bump (only the materialized/
disposable table changes; `base`/`mutations`/`labels`/`sync` are untouched):

```
db.version(2).stores({
  notes: "id, lifecycle, updatedAt, *labelIds", // materialized view; +lifecycle/label indexes
});
```

Bumping is safe because `db.notes` is **disposable** (ADR-0003: rebuildable from base + queue at any
time) — the version-2 upgrade just triggers a `rebuild()`. `LocalNote` is the row type:

```
interface LocalNote extends NoteMeta {           // NoteMeta = id,title,preview,access,lifecycle,
  labels: LabelChip[];                            //   labelIds,updatedAt,metaVersion (spec 14 contract)
}                                                 // + resolved chips. Superset of NoteSummary → the
                                                  //   cards consume it with no prop change.
```

`*labelIds` is a **multiEntry** index so the label-filtered view queries by membership without a table
scan. `LocalLabel` mirrors `db.labels` rows (`Label`: `id,name,color,noteCount`, filled by 16/19).

---

## Reactive selectors (`apps/web/lib/sync/reads.ts`)

`useLiveQuery` (from `dexie-react-hooks`) re-runs the query and re-renders whenever the queried tables
change — including from another tab (Dexie observes IndexedDB origin-wide). All selectors return
`undefined` on the first tick, which callers read as "loading".

```
import { useLiveQuery } from "dexie-react-hooks";

/** Owned lifecycle view (active|archived|trashed), optionally filtered to one label.
 *  Replaces useNotes() reads. Returns undefined while Dexie hydrates. */
export function useLocalNotes(filter: NoteFilter, labelId?: string | null) {
  return useLiveQuery(() => {
    if (labelId) {
      // label view implies the active lifecycle (see dashboard-view.ts)
      return db.notes.where("labelIds").equals(labelId)
        .filter((n) => n.lifecycle === "active").toArray();
    }
    return db.notes.where("lifecycle").equals(filter).toArray();
  }, [filter, labelId]);
}

/** Single materialized note (owner controls read isOwner). Replaces useNote() reads. */
export function useLocalNote(id: string) {
  return useLiveQuery(() => db.notes.get(id), [id]);
}

/** Sidebar label list. Replaces useLabels() reads. */
export function useLocalLabels() {
  return useLiveQuery(() => db.labels.toArray(), []);
}
```

The `filter` values come straight from `lib/dashboard-view.ts` (`filterForView`, `NoteFilter`) — a
label view pins `active` there, matching the selector. Ordering for display stays where it is today
(the components already render `updatedAt`); the `updatedAt` index is available if the list needs a
`.reverse().sortBy("updatedAt")`.

### Flag-gated adapters (keep call sites path-agnostic)

Components must not sprout `if (flag)` branches. `reads.ts` exports adapters that pick the source once,
on the stable flag, and normalize to the shape the pages already use:

```
export function useNoteList(filter: NoteFilter, labelId: string | null, isShared: boolean) {
  if (isSyncEngineEnabled()) {
    const notes = useLocalNotes(filter, labelId);      // db.notes (LocalNote[] | undefined)
    return { notes, loading: notes === undefined };
  }
  const q = isShared ? useSharedNotes() : useNotes(filter, labelId, !isShared); // today's Query path
  return { notes: q.data, loading: q.isPending };
}
```

`isSyncEngineEnabled()` is constant for the process, so this conditional-hook branch is safe (React's
rule is stable call order across renders; the branch never flips mid-session — the same pattern spec
14's `<SyncEngineProvider>` uses). `app/dashboard/page.tsx` replaces its `useNotes(...)` /
`useSharedNotes()` reads with `useNoteList(...)` and reads `{ notes, loading }` (mapping today's
`notesQuery.data ?? []` / `notesQuery.isPending`); the note page swaps `useNote(id)` for
`useNoteDetail(id)`. Create/seed, search, masonry, dialogs, and every **write** stay exactly as they
are (writes move to the queue in spec 19).

### Shared view (owner marker deferred to spec 16)

The four **owned** views (My Notes / Archive / Trash / label filter) map cleanly onto
`NoteMeta.lifecycle` + `labelIds`. The **Shared-with-me** view needs `ownerName` and an owner flag,
which `NoteMeta` (spec 14, deliberately owner-agnostic) does not carry. Rather than bake a rendering
concern into the wire contract here, spec 15 keeps the Shared read on today's `useSharedNotes` Query
path (it is a separate endpoint anyway) and records that serving it locally requires an **additive
`owner` field on the CVR's base rows, owned by spec 16**. The `useNoteList` adapter routes `isShared`
to Query in both flag states until then (see *Decisions* and *Risks*).

---

## Bootstrap (`apps/web/lib/sync/provider.tsx`)

Spec 14 left `SyncEngineBootstrap` as a thin flag-on wrapper that opens Dexie and resolves
`clientGroupID`. Spec 15 gives it the one-shot fill so the read path has data:

```
function SyncEngineBootstrap({ children }: { children: ReactNode }) {
  useEffect(() => {
    let cancelled = false;
    (async () => {
      await getClientGroupID();       // spec 14: mint-once identity
      await pull();                   // spec 16 puller SEAM — fills db.base / db.labels (stub for now)
      if (!cancelled) await rebuild(); // spec 15: materialize db.notes from base + queue
    })();
    return () => { cancelled = true; };
  }, []);
  return <>{children}</>;
}
```

- **Trigger + ordering are spec 15's**; the CVR mechanics inside `pull()` are spec 16's. Importing the
  puller seam now (spec 16 ships it as a stub, like spec 14 shipped `rebuild()` as a stub) keeps the
  import stable and the composition root edited once.
- Children render immediately; the **reads** gate on `useLiveQuery` returning `undefined` (skeleton),
  not on the bootstrap promise — so there is no full-screen block, just per-list skeletons until the
  first `rebuild()` writes `db.notes`.
- Reconnect / focus / poke-driven re-pulls are **not** here (spec 16 attaches those to this same
  seam). Spec 15 does the **initial** fill only.

---

## Dependencies & build order

Spec numbers follow the ADRs (15 ↔ 0003); the **build** order differs (from the authoring brief):

| Spec | ADR | Slug | Depends on (build order) |
|---|---|---|---|
| 14 | 0002 | sync-foundations | (root) |
| **15** | 0003 | **dexie-local-store** | **14** |
| 16 | 0004 | cvr-delta-pull | 14, 15, 19 |
| 18 | 0006 | client-minted-ids | 14, 15 |
| 19 | 0007 | named-mutators | 14, 15, 18 |

Recommended sequence: **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20**. Spec 15 builds **immediately after
14** and depends only on it. It ships two **forward seams** consumed by later specs: (a)
`applyClientMutation` — the client-mutator dispatch spec 19 fills; (b) the bootstrap's `pull()`
import — the puller seam spec 16 implements. Because those siblings build *after* 15, spec 15's own
tests exercise `rebuild()`/selectors by seeding `db.base` / `db.mutations` / `db.labels` **directly**
(not through a real pull or real mutators), which is exactly the isolation that makes the read path
testable on its own. Everything stays behind `NEXT_PUBLIC_SYNC_ENGINE` until the whole sequence
completes.

## Cross-cutting rules

- **Contracts stay in `@yapper/schemas`.** `NoteMeta`, `LabelChip`, `Label`, `noteAccessSchema` are
  imported from spec 14's `sync.ts` / existing `note.ts` / `label.ts`. `LocalNote` / `LocalLabel` are
  local **materialized** row types (a client rendering concern, ADR-0003), not new wire shapes — do not
  add them to the schemas package.
- **`db.base` / `db.mutations` are read-only inputs** to `rebuild()`. Spec 15 never writes `db.base`
  (puller-only, spec 16) and never writes `db.mutations` (queue, spec 19). It writes only `db.notes`,
  and only via `rebuild()` (the view is derived, never hand-edited — ADR-0003).
- **Single env gate.** Only `lib/sync/flag.ts` reads the env var; the adapters call
  `isSyncEngineEnabled()`. Flag off ⇒ today's TanStack Query reads, unchanged.
- **Permissions stay server-authoritative.** Local reads are optimistic display only, never a trust
  boundary; `isOwner`/`access` on a materialized row gate **UI**, not access (the socket/REST enforce).
- **No `as any`.** Strict TS; type Dexie tables and selector results from `@yapper/schemas` +
  the `LocalNote`/`LocalLabel` interfaces.
- **Realtime co-editing untouched.** Hocuspocus cursors/presence and the made-private kick are
  orthogonal; spec 15 only changes where the **list/metadata** reads come from.
- **TDD:** write the failing goal-state tests first (`rebuild()` fold + base-only + determinism +
  chip-drop; selector `undefined → data`; adapter flag routing; bootstrap order). A slice is done only
  when green + `tsc --noEmit` clean + Biome clean. Run `apps/web` tests from `apps/web` with
  `bunx vitest run --maxWorkers=1` (full suite OOMs on default parallel); the Dexie tests need
  `fake-indexeddb`.

## Risks / notes

- **Materialize determinism.** `rebuild()` must be a pure, total function of `(base, mutations,
  labels)` — no wall-clock, no random, no read of `db.notes` itself. The clear + `bulkPut` full
  recompute guarantees idempotence (goal #3); resist the temptation to "optimize" into an incremental
  diff (unnecessary at hundreds of rows and a determinism hazard). Wrap it in one `rw` transaction so a
  concurrent pull/mutate can't observe or interleave a partial view.
- **First-tick `undefined`.** `useLiveQuery` returns `undefined` before the first async query resolves
  (ADR-0003 calls this out). Every selector caller must treat `undefined` as **loading** and render the
  skeleton, never as "empty" (which would flash "No notes yet" then pop the list). The adapters encode
  this (`loading: notes === undefined`); the goal-#7 test guards it.
- **jsdom has no IndexedDB.** Dexie + `useLiveQuery` tests need `fake-indexeddb` (e.g.
  `fake-indexeddb/auto` in the sync test setup, dev-only — keep it out of the app bundle). Dexie's live
  observation works over fake-indexeddb, so `useLiveQuery` re-render tests are reliable there; render
  them with Testing Library and `await` the `undefined → data` transition.
- **Empty queue until spec 19.** With no queue writer yet, the flag-on read path shows only what the
  puller put in `db.base`. Until spec 16's real `pull()` lands, `db.base` is empty and the flag-on
  dashboard is empty — expected for the staged build, and why the flag stays off in prod. Spec 15's
  correctness is proven by seeding base/labels directly in tests, not by an end-to-end pull.
- **Chip cold-miss.** A `labelId` present on a base row but absent from `db.labels` (label not yet
  pulled) drops silently (goal #4). This is the local analogue of spec 13c's "degrade to no chip rather
  than guess"; once spec 16 pulls labels into `db.labels`, the next `rebuild()` fills the chip.
- **Shared-view owner gap.** `NoteMeta` has no owner marker, so the Shared view can't be served from
  `db.notes` yet; it stays on Query (both flag states) until spec 16 adds an additive `owner` field to
  the CVR base rows. Flagged and owned by 16 — not an accidental omission (see *Decisions* ADR-003).
- **Version bump ordering.** `db.version(2)` (adding `notes` indexes) must be additive over spec 14's
  `version(1)`; since `db.notes` is disposable, the upgrade needs no data migration — it just prompts a
  `rebuild()`. Don't re-index `base`/`mutations` here (not this spec's concern).
