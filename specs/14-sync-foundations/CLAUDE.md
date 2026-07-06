# CLAUDE.md — 14 · Sync Foundations

## Project Context

The **shared skeleton** for the local-first sync engine (ADR-0002), the **root** of the eight-spec
build (14–21). This spec ships the seams every sibling plugs into and **no sync behavior**:
- the feature flag `NEXT_PUBLIC_SYNC_ENGINE` + `isSyncEngineEnabled()` (single gate for the whole
  engine),
- the `@yapper/schemas` sync contract skeleton (`mutationSchema` over 14 names, push/pull
  request+response, `pokeEventSchema`, `NoteMeta`),
- the Dexie `yapper-sync` DB module (`base`/`notes`/`mutations`/`labels`/`sync`) + `clientGroupID`
  bootstrap + the `rebuild()` **contract seam** (stub; spec 15 implements it),
- the flag-gated `<SyncEngineProvider>` mounted in `app/providers.tsx`,
- the written **retirement/cutover plan** + flag-flip criteria.

With the flag **off** (default, incl. prod), the app is byte-for-byte today's TanStack Query notes
path. `apps/web` + `packages/schemas` only; **no server, DB, or Redis code** in this spec (the engine
contracts are defined here, but their servers are built by 16/17/19/20).

## Before Starting Work

1. Read `specs/14-sync-foundations/design.md` (Goal State + contract/table/flag detail + the
   Dependencies & build order and Retirement sections).
2. Read `decisions.md` (spec-local choices) and the governing ADR `docs/adr/0002-…`.
3. Check `implementation.md` for progress / next step.
4. Look at existing patterns in:
   - `apps/web/app/providers.tsx` (where `<SyncEngineProvider>` mounts, inside the Query tree)
   - `apps/web/lib/query-client.ts` (browser-singleton pattern to mirror for the Dexie instance)
   - `apps/web/lib/queries/notes.ts` + `optimistic.ts` (the path being retired — read, don't touch)
   - `packages/schemas/src/{common,note,label}.ts` + `index.ts` (contract style; reuse
     `noteAccessSchema` / `labelColorSchema`; export `xxxSchema` + `Xxx` type; barrel re-export)
   - `packages/db/src/schema.ts` (`note` columns, `noteAccess`/`collabStatus` — orient `NoteMeta` and
     the named-but-not-built `meta_version`/`sync_client`/`sync_cvr` additions owned by 16/19)

## Code Patterns

- **Single env gate:** only `lib/sync/flag.ts` reads `process.env.NEXT_PUBLIC_SYNC_ENGINE`. Everything
  else calls `isSyncEngineEnabled()`. Flag off ⇒ engine inert, today's app unchanged.
- **Contracts in `@yapper/schemas`** (`sync.ts`, re-exported from `index.ts`): `xxxSchema` value +
  `Xxx` `z.infer` type, side by side. Reuse `./common` enums (`noteAccessSchema`, `labelColorSchema`).
  Never redefine a shape in web or api.
- **14 canonical mutation names** (do not rename — siblings reference them): `createNote`,
  `renameNote`, `archiveNote`, `unarchiveNote`, `trashNote`, `restoreNote`, `permanentDeleteNote`,
  `setShareLevel`, `makePrivate`, `createLabel`, `renameLabel`, `deleteLabel`, `applyLabel`,
  `removeLabel`. `mutationSchema` = discriminated union on `name`.
- **Dexie schema is canonical:** DB `yapper-sync`, `db.version(1).stores({ base:"id", notes:"id",
  mutations:"++seq, id", labels:"id", sync:"key" })`. `clientGroupID` = `crypto.randomUUID()` minted
  once, stored in `db.sync`, shared across tabs.
- **`rebuild()` is a SEAM here:** export the typed function that throws `not-implemented`; **spec 15**
  writes the replay body. Do not implement replay in spec 14.
- **Provider is a thin seam:** `<SyncEngineProvider>` = transparent pass-through when the flag is off;
  when on, opens Dexie + ensures `clientGroupID`, then renders children. No pusher/puller/poke wiring.
- **No `as any`** — strict TS; type Dexie tables and cache shapes from `@yapper/schemas`.
- **TDD:** failing goal-state test first (flag off/on, contract parse round-trip, Dexie schema +
  `clientGroupID` idempotence, provider no-op-when-off), then green + `tsc --noEmit` + Biome.

## Repo Gotchas (for the implementer)

- **jsdom has no IndexedDB.** Dexie/`clientGroupID` tests need `fake-indexeddb` (dev-only, e.g.
  `fake-indexeddb/auto` in the sync test setup). Keep it out of the app bundle.
- **`apps/web` full Vitest suite OOMs** on default parallel — run `bunx vitest run --maxWorkers=1`
  (via Vitest, not raw `bun test`). Run web tests from `apps/web`.
- **`packages/schemas` tests** run with `bun test` from the package dir.
- No local Docker — but this spec touches **no** DB/Redis, so that's only relevant to the siblings.

## Don't

- **Don't add sync behavior.** No pusher, puller, poke, mutators, or `rebuild()` replay — those are
  siblings 15–21. Spec 14 is seams + contracts + flag only.
- **Don't delete or edit** `lib/queries/notes.ts` or `optimistic.ts` — the flag-off path depends on
  them; deletion is spec 19 / final cutover, only when the flag flips (see Retirement plan).
- **Don't touch `apps/api`, `apps/socket`, `packages/db`, or Redis.** Define the contracts, not their
  servers. If a foundation seems to need a server change, it belongs to a sibling spec — cite it.
- **Don't rename the 14 mutation names, the Dexie DB/table names, `clientGroupID`, or the push/pull
  field names** — other specs reference these canonical names.
- **Don't read `process.env.NEXT_PUBLIC_SYNC_ENGINE` anywhere but `flag.ts`.**
- **Don't let the engine run when the flag is off**, and don't put server data in Zustand or skip tests.
