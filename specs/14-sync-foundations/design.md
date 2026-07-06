# 14 · Sync Foundations — Design

The local-first sync engine (ADR-0002) is a multi-week, eight-spec build. Before any lane can move,
the specs need a **shared skeleton** they all plug into: a feature flag that gates the whole engine, a
Zod contract package that web and api both import, a local Dexie database with the canonical table
shape and `clientGroupID` bootstrap, an engine provider seam mounted in `providers.tsx`, and an agreed
plan for retiring today's TanStack Query notes path once the engine is complete. This spec builds only
those foundations — **no sync behavior**. When it lands, the app runs exactly as it does today (the
flag is off), but siblings 15–21 have concrete, typed seams to build against instead of inventing
names in parallel and colliding.

Everything here is inert until `NEXT_PUBLIC_SYNC_ENGINE=1`. With the flag off (the default, including
prod), `apps/web` keeps its current TanStack Query notes path untouched. This is spec 14 of the
engine — the **root** of the build-order graph (see *Dependencies & build order* below): every other
sync spec depends on it, and it depends on nothing new.

## Goal State (acceptance)

**Feature flag**
1. `apps/web/lib/sync/flag.ts` exports `isSyncEngineEnabled(): boolean`, returning `true` iff
   `process.env.NEXT_PUBLIC_SYNC_ENGINE === "1"`. It is the **single** gate; no other file reads the
   env var directly.
2. With the flag **off**, the app renders and behaves exactly as today — the TanStack Query notes path
   (`lib/queries/notes.ts`, `optimistic.ts`) is the live path and no Dexie/engine code runs or
   throws. A test proves the dashboard mounts unchanged when the flag is unset.
3. With the flag **on**, the engine provider seam mounts (see #7) without altering the existing Query
   providers — both trees coexist during the migration.

**Shared contracts (`@yapper/schemas`)**
4. A new `sync.ts` module in `packages/schemas/src` exports the engine wire contracts, re-exported
   from the barrel (`index.ts`): `mutationSchema` (a discriminated union on `name` over the **14**
   mutation names, each with its typed `args`), `pushRequestSchema` / `pushResponseSchema`,
   `pullRequestSchema` / `pullResponseSchema`, `pokeEventSchema`, and a shared `noteMetaSchema`
   (`NoteMeta`). Every schema is exported alongside its `z.infer` type (`Mutation`, `PushRequest`,
   `NoteMeta`, …). No shape is duplicated in web or api.
5. `mutationSchema` enumerates exactly the 14 canonical mutation names (see *Contracts* below); a Zod
   parse of an unknown `name` fails, and a parse of each known name validates its `args`. A goal-state
   test in `packages/schemas/src/sync.test.ts` asserts round-trip parse for a representative mutation
   of each arg-shape family and rejects a bogus name.
6. `pushResponseSchema` models a **per-mutation verdict** (`applied` | `rejected` with an optional
   `reason` code for permanent rejects). `pullResponseSchema` carries `puts: NoteMeta[]`,
   `dels: string[]`, `lastMutationID`, and `cookie`. Types compile clean under strict TS in both web
   and api (`tsc --noEmit`).

**Dexie local store**
7. `apps/web/lib/sync/db.ts` defines a Dexie database `yapper-sync` with the five canonical tables and
   indexes: `base` (PK `id`), `notes` (PK `id`), `mutations` (auto-inc PK `seq`, index `id`), `labels`
   (PK `id`), `sync` (PK `key`). It exports the typed `db` instance and row types.
8. A `clientGroupID` bootstrap: `getClientGroupID()` reads `db.sync` key `clientGroupID`; if absent it
   mints `crypto.randomUUID()`, persists it, and returns it — minted once per browser, stable across
   tabs and reloads. A test proves a second call returns the same id.
9. `db.ts` declares the `rebuild()` **contract** (signature + doc): `rebuild()` recomputes
   `notes = replay(mutations) over base` and is the shared primitive every local mutation and every
   pull calls. Spec 14 defines and exports the seam (a typed function stub that throws
   `not-implemented`); **spec 15 implements the replay body.** A test asserts the export exists with
   the documented signature.

**Engine provider seam**
10. `apps/web/lib/sync/provider.tsx` exports a `<SyncEngineProvider>` that, when
    `isSyncEngineEnabled()` is true, opens the Dexie db and ensures `clientGroupID`, then renders
    children; when false it is a transparent pass-through (renders children, touches nothing). It is
    mounted in `app/providers.tsx` **inside** the existing provider tree. No pusher/puller/poke wiring
    yet — those are the seams siblings attach to.
11. Mounting the provider with the flag off is a no-op verified by test (no Dexie open, no errors);
    with the flag on it opens `yapper-sync` and resolves `clientGroupID` before children mount.

**Retirement / cutover plan**
12. `design.md` (this file) documents the **retirement plan** for the old Query notes path and the
    **flag-flip criteria** (see *Retirement & cutover* below). No old code is deleted in this spec —
    deletion is owned by spec 19 (mutators) / the final cutover, and only happens when the flag flips.

**Cross-cutting**
13. New Dexie dependency added to `apps/web` only. `tsc --noEmit` clean in `apps/web` and
    `packages/schemas`; Biome clean (2-space, double quotes, 100 cols); no `as any`. Goal-state tests
    written first (TDD) and green.

## Scope

**In:**
- `apps/web/lib/sync/flag.ts` — `isSyncEngineEnabled()` (the single env gate).
- `packages/schemas/src/sync.ts` + `sync.test.ts` — the engine wire-contract skeleton
  (`mutationSchema`, push/pull request+response, `pokeEventSchema`, `noteMetaSchema`), re-exported
  from `index.ts`.
- `apps/web/lib/sync/db.ts` + `db.test.ts` — the Dexie `yapper-sync` schema (5 tables), row types,
  `getClientGroupID()` bootstrap, and the `rebuild()` **contract seam** (stub, implemented by 15).
- `apps/web/lib/sync/provider.tsx` + test — the flag-gated `<SyncEngineProvider>` seam.
- `apps/web/app/providers.tsx` — mount `<SyncEngineProvider>` inside the existing tree.
- Add `dexie` to `apps/web/package.json`.
- The written retirement/cutover plan + flag-flip criteria (in this doc).

**Out (see future-work.md and the named sibling spec):**
- Any `rebuild()` **replay logic**, `db.notes` materialization, or `useLiveQuery` read selectors →
  **spec 15** (dexie-local-store).
- Client/server **mutators** (the pure client mutators + authoritative server mutators) and retiring
  `optimistic.ts` / `notes.ts` reads → **spec 19** (named-mutators).
- Client-minted note ids end-to-end + idempotent create → **spec 18** (client-minted-ids).
- The pusher, `/api/sync/push`, `lastMutationID`, `sync_client` table → **spec 19**.
- The CVR puller, `/api/sync/pull`, `note.meta_version`, `sync_cvr` table → **spec 16** (cvr-delta-pull).
- SSE poke transport (`/api/sync/stream`, Redis `poke:user:{userId}`) → **spec 17** (sse-poke).
- Content lane (`PUT /api/notes/:id/content`, shared derive helper, private↔shared handoff) →
  **spec 20** (content-lane).
- Rollback UX (transient vs permanent classification, revert toast) → **spec 21** (rollback-ux).
- Any server route, DB migration, or Redis wiring — spec 14 defines the **contracts** for these but
  ships **no** server code. The `packages/db` additions (`note.meta_version`, `sync_client`,
  `sync_cvr`) are named here for orientation but authored by 16/19.

---

## Contracts — `packages/schemas/src/sync.ts`

The single source of truth for the engine wire format, imported by `apps/web` (pusher/puller, later
specs) and `apps/api` (`/api/sync/*`, later specs). Follow the package convention: every `xxxSchema`
value is exported next to its `Xxx` `z.infer` type; pure Zod, no runtime imports.

### `noteMetaSchema` → `NoteMeta`

The authoritative per-note metadata row the puller returns and `db.base` stores. Superset of today's
`noteSummary` with the sync-critical `metaVersion` (mirrors the server's `note.meta_version`) and the
lifecycle/label fields the engine tracks:

```
noteMetaSchema = z.object({
  id: z.string(),
  title: z.string(),
  preview: z.string(),
  access: noteAccessSchema,          // reuse from ./common (private|view|edit)
  lifecycle: z.enum(["active", "archived", "trashed"]),
  labelIds: z.array(z.string()),     // label membership (ids; chips resolved from db.labels)
  updatedAt: z.string(),
  metaVersion: z.number(),           // bumped on every authoritative metadata write (ADR-0004)
})
```

> Note: `NoteMeta` is the **wire/base** shape. The materialized `db.notes` row the UI reads (with
> resolved label chips) is defined by spec 15; keep `NoteMeta` label-**ids**-only here so the contract
> stays server-authoritative and chip rendering is a client concern.

### `mutationSchema` → `Mutation`

A discriminated union on `name` over the **14** canonical mutation names, each carrying typed `args`.
Names (ADR-0007, canonical — do not rename):

`createNote`, `renameNote`, `archiveNote`, `unarchiveNote`, `trashNote`, `restoreNote`,
`permanentDeleteNote`, `setShareLevel`, `makePrivate`, `createLabel`, `renameLabel`, `deleteLabel`,
`applyLabel`, `removeLabel`.

Arg families (each `name` is one `z.object({ name: z.literal(...), args: <argsSchema> })` member):

| Mutation | `args` |
|---|---|
| `createNote` | `{ id: string, title?: string }` (id client-minted, spec 18) |
| `renameNote` | `{ id: string, title: string }` |
| `archiveNote` / `unarchiveNote` / `trashNote` / `restoreNote` / `permanentDeleteNote` | `{ id: string }` |
| `setShareLevel` | `{ id: string, level: z.enum(["view","edit"]) }` |
| `makePrivate` | `{ id: string }` |
| `createLabel` | `{ id: string, name: string, color: labelColorSchema }` |
| `renameLabel` | `{ id: string, name: string }` |
| `deleteLabel` | `{ id: string }` |
| `applyLabel` / `removeLabel` | `{ noteId: string, labelId: string }` |

Reuse `noteAccessSchema` / `labelColorSchema` from `./common` — never redefine the palette or access
enum. The union is exported as `mutationSchema`; `mutationNameSchema = z.enum([...])` is exported too
so the pusher and server can enumerate names.

### `pushRequestSchema` / `pushResponseSchema`

```
pushRequestSchema = z.object({
  clientGroupID: z.string().uuid(),
  mutations: z.array(z.object({ seq: z.number(), name: mutationNameSchema, args: z.unknown() })),
})
```

> The pusher sends `{ seq, name, args }` envelopes; the **server** re-validates each `args` against the
> matching `mutationSchema` member. Modelling `mutations` as `mutationSchema.and({ seq })` is the
> alternative — deferred to spec 19 which owns the pusher; spec 14 keeps the envelope shape and the
> per-mutation verdict, which is what siblings need to type against.

`pushResponseSchema` = per-mutation verdict list (ADR-0009):

```
pushVerdictSchema = z.object({
  seq: z.number(),
  status: z.enum(["applied", "rejected"]),
  reason: z.enum(["forbidden", "invalid", "conflict"]).optional(),  // only on rejected (permanent)
})
pushResponseSchema = z.object({
  lastMutationID: z.number(),
  verdicts: z.array(pushVerdictSchema),
})
```

Transient failures (offline / 5xx / network) are **not** verdicts — the server leaves those mutations
unprocessed and does not advance `lastMutationID` (ADR-0009; classification implemented in spec 21).

### `pullRequestSchema` / `pullResponseSchema`

```
pullRequestSchema  = z.object({ clientGroupID: z.string().uuid(), cookie: z.string().nullable() })
pullResponseSchema = z.object({
  puts: z.array(noteMetaSchema),   // upserts into db.base
  dels: z.array(z.string()),       // note ids removed since the cookie
  lastMutationID: z.number(),
  cookie: z.string(),              // opaque monotonic per client-group (never wall-clock)
})
```

CVR delta semantics (which rows are in `puts`/`dels`) are owned by spec 16; spec 14 only fixes the
envelope.

### `pokeEventSchema`

```
pokeEventSchema = z.object({ type: z.literal("poke") })
```

Minimal by design (ADR-0005): a poke is a content-free "you have changes — pull now" nudge; the SSE
transport and Redis channel are spec 17. Kept in the contract package so both the SSE server and the
client subscriber type against the same shape.

---

## Dexie local store — `apps/web/lib/sync/db.ts`

Dexie (IndexedDB wrapper) is the client's durable store. Spec 14 defines the schema + identity
bootstrap + the `rebuild()` seam; spec 15 fills in the read/replay behavior.

```
db = new Dexie("yapper-sync")
db.version(1).stores({
  base:      "id",         // authoritative note-meta rows — puller writes only (NoteMeta)
  notes:     "id",         // materialized view the UI reads via useLiveQuery (spec 15)
  mutations: "++seq, id",  // pending queue; auto-inc seq = monotonic apply order; index by note id
  labels:    "id",         // label rows
  sync:      "key",        // singletons: clientGroupID | cookie | lastMutationID
})
```

Row types are derived from the contracts where they cross the wire: `base` rows are `NoteMeta`;
`mutations` rows are `{ seq: number } & Mutation` (the queued envelope); `sync` rows are
`{ key: string; value: string }`. `notes` (materialized) and `labels` row shapes are finalized in
spec 15 — spec 14 declares minimal interfaces and marks them "extended by 15".

**`clientGroupID` bootstrap** (canonical identity, shared by push/pull):

```
async function getClientGroupID(): Promise<string> {
  const row = await db.sync.get("clientGroupID");
  if (row) return row.value;
  const id = crypto.randomUUID();
  await db.sync.put({ key: "clientGroupID", value: id });
  return id;
}
```

Minted once per browser; stored in `db.sync`; shared across tabs (IndexedDB is origin-scoped). A
race between two tabs on first mint is benign (the `put` is idempotent on `key`; last write wins and
both tabs then read the same row) — but note it as a known edge (see Risks).

**`rebuild()` contract** (the shared primitive — **body implemented by spec 15**):

```
/** Recompute db.notes = replay(mutations) over db.base. Runs after every local mutation and every
 *  pull. Spec 14 defines this seam; spec 15 implements the replay. */
export async function rebuild(): Promise<void> {
  throw new Error("rebuild() not implemented — spec 15");
}
```

Exporting the stub now lets spec 15's mutators and spec 16's puller import a stable symbol; the
throwing body guarantees no one accidentally relies on it before 15 lands (and the flag keeps it out
of the live path regardless).

## Engine provider seam — `apps/web/lib/sync/provider.tsx`

```
export function SyncEngineProvider({ children }: { children: ReactNode }) {
  if (!isSyncEngineEnabled()) return <>{children}</>;   // transparent pass-through when off
  // flag on: ensure Dexie open + clientGroupID resolved, then render children.
  // No pusher/puller/poke here — siblings (16/17/19) attach their hooks to this seam.
  return <SyncEngineBootstrap>{children}</SyncEngineBootstrap>;
}
```

Mounted in `app/providers.tsx` inside the existing tree so both paths coexist during migration:

```
<ThemeProvider …>
  <QueryClientProvider client={queryClient}>
    <SyncEngineProvider>
      {children}
    </SyncEngineProvider>
    <Toaster />
  </QueryClientProvider>
</ThemeProvider>
```

The bootstrap effect opens the db and calls `getClientGroupID()` once on mount; children render
immediately (the engine has no reads yet, so there is nothing to gate rendering on). Keep it a thin
seam — the point is that siblings mount their engine hooks **here**, not that spec 14 does any sync.

---

## Dependencies & build order

Spec numbers follow the ADRs (14 ↔ 0002); the **build** order differs. Spec 14 is the **root** —
every other sync spec depends on it, and it depends on nothing new. The engine-wide graph (from the
authoring brief):

| Spec | ADR | Slug | Depends on (build order) |
|---|---|---|---|
| **14** | 0002 | **sync-foundations** | **(root)** |
| 15 | 0003 | dexie-local-store | 14 |
| 16 | 0004 | cvr-delta-pull | 14, 15, 19 |
| 17 | 0005 | sse-poke | 14, 16, 19 |
| 18 | 0006 | client-minted-ids | 14, 15 |
| 19 | 0007 | named-mutators | 14, 15, 18 |
| 20 | 0008 | content-lane | 14, 15, 16, 19 |
| 21 | 0009 | rollback-ux | 14, 19, 16 |

Recommended build sequence for the whole engine: **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20**.
Everything stays behind `NEXT_PUBLIC_SYNC_ENGINE` until that sequence completes. This spec ships
**first** and unblocks all seven others by fixing the flag, the contracts, the Dexie schema, and the
provider seam.

## Retirement & cutover plan

The engine is built behind the flag; the old TanStack Query notes path stays fully live until the
sequence is complete. Retirement is deliberate and staged:

**What gets retired (and by whom):**
- `apps/web/lib/queries/notes.ts` — the note **reads** (`useNotes`/`useSharedNotes`/`useNote`) and the
  lifecycle/label mutation hooks. Replaced by Dexie `useLiveQuery` selectors (spec 15) + engine
  mutations (spec 19).
- `apps/web/lib/queries/optimistic.ts` — the spec-13 optimistic factory. Superseded by the
  base+queue→`rebuild()` model; deleted by **spec 19** (which owns the client mutators that replace it).
- TanStack Query for notes generally: per ADR-0002, "the sync engine owns notes; Query may remain for
  incidental, non-local-first reads." Auth/session (Better Auth) and any non-notes Query usage stay.

**How it's removed:** each consuming component is migrated to the engine selectors **behind the flag**
first (both code paths present, flag chooses at runtime). Only after the full sequence is green and the
flag flips (below) does spec 19 / the final cutover **delete** the retired `optimistic.ts` and the
notes-path reads — a single, reviewable "remove dead Query notes path" PR, not incremental deletion
mid-migration. Deleting earlier would break the flag-off path this spec guarantees.

**Flag-flip criteria** (all must hold before `NEXT_PUBLIC_SYNC_ENGINE` defaults to on / the old path
is deleted):
1. Specs 15–21 are complete, each goal-state-tested and green.
2. With the flag on: create/rename/lifecycle/label/share mutations all apply optimistically, push,
   and reconcile via pull; permanent rejects roll back with a toast (spec 21); the content lane
   persists private notes and re-derives title/preview (spec 20).
3. Cross-device propagation works: a mutation on one client pokes and pulls to another (spec 17).
4. Offline: mutations queue durably and replay on reconnect (specs 15/18/19).
5. No regression in the realtime co-editing path (Hocuspocus cursors/presence, made-private kick) —
   it is orthogonal and untouched throughout.
6. A parity pass confirms the dashboard/editor UX at least matches the flag-off experience.

Until then, the flag stays off by default and this spec's guarantee holds: **flag off = today's app,
unchanged.**

## Cross-cutting rules
- **Contracts live in `@yapper/schemas`** (`sync.ts`), imported by web + api; never duplicate a shape
  per app. Derive types with `z.infer`. Reuse `noteAccessSchema` / `labelColorSchema` from `./common`.
- **Everything behind the feature flag.** `isSyncEngineEnabled()` is the single gate; with it off the
  app is byte-for-byte today's behavior and no engine code runs. No other file reads the env var.
- **No `as any`.** Strict TS. Match Biome style (2-space, double quotes, 100 cols).
- **Permissions stay server-authoritative** — the engine never becomes a trust boundary. Spec 14 adds
  no permission logic; later server mutators reuse `@yapper/permissions` (same cache-first rule as
  REST/socket).
- **Client-minted ids** are `crypto.randomUUID()`; the same id keys `db.base`/`db.notes`, the CVR,
  `note_doc.note_id`, and the `y-indexeddb` doc name (formalized in spec 18). Spec 14's contracts
  already carry `id` in `createNote.args` to make this offline-safe.
- **Cookie is opaque + monotonic** (per client-group sequence), never wall-clock (ADR-0004).
- **Realtime co-editing is untouched** — Hocuspocus cursors/presence and the made-private kick are
  orthogonal to the engine.
- **TDD:** write the failing goal-state tests first (flag off/on behavior, contract parse round-trip,
  Dexie schema + `clientGroupID` idempotence, provider no-op-when-off). A slice is done only when
  green + `tsc --noEmit` clean + Biome clean. Run `apps/web` tests from `apps/web` with
  `bunx vitest run --maxWorkers=1` (full suite OOMs on default parallel — see CLAUDE.md);
  `packages/schemas` tests run with `bun test` from the package dir.

## Risks / notes
- **Dexie in jsdom:** Vitest's jsdom has no real IndexedDB. The Dexie + `clientGroupID` tests need
  `fake-indexeddb` (dev-only) or must mock the Dexie layer. Pick `fake-indexeddb/auto` in the web
  test setup for the sync tests; note it in implementation.md. Don't let it leak into the app bundle.
- **Contract churn:** siblings 16/19/20 will want to *extend* these schemas (e.g. richer verdict
  reasons, CVR internals). Spec 14 fixes the **envelope and names**; additive changes by later specs
  are fine, renames are not (other specs reference the canonical names). Keep `mutationSchema`'s 14
  names and the push/pull field names stable.
- **`rebuild()` throwing stub:** exported now so imports are stable, but it must never run on the live
  path. The flag guarantees this; the throwing body is a tripwire if someone wires it early.
- **First-mint tab race:** two tabs opening simultaneously on a fresh browser could both mint a
  `clientGroupID` before either persists. The `put` keyed on `clientGroupID` makes this
  last-write-wins and self-heals to one shared id; acceptable (documented) — a Dexie transaction can
  harden it in spec 15 if it ever matters.
- **Provider mount cost:** `SyncEngineProvider` opens IndexedDB when the flag is on; with it off it is
  a pure pass-through with zero cost. The default-off flag keeps prod unaffected.
- **`NoteMeta` vs materialized `notes`:** keeping `NoteMeta` label-ids-only (chips resolved
  client-side in spec 15) avoids baking a rendering concern into the server contract. If a later spec
  wants denormalized chips on the wire, that's an explicit contract change, not an accident.
