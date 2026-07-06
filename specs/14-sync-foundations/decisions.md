# 14 · Sync Foundations — Decisions

These are **spec-local** choices for the sync engine's shared skeleton. The umbrella architecture
decision — build a hand-rolled, two-lane local-first engine borrowing the Replicache model — is
**ADR-0002** (`docs/adr/0002-local-first-sync-engine-two-lanes.md`) and its family ADR-0003…0009. Do
not re-litigate those here; this file records only choices spec 14 makes for the foundations.

## ADR-001: A single env feature flag gates the entire engine

### Context
ADR-0002 mandates a large, staged build that must never break prod mid-migration: "everything stays
behind `NEXT_PUBLIC_SYNC_ENGINE` until the sequence completes." Seven sibling specs will each land
partial engine code. We need one authoritative on/off switch that all of them consult identically.

### Options Considered
1. **One env var + one helper (`isSyncEngineEnabled()` in `lib/sync/flag.ts`)** — the single gate;
   every engine file calls the helper, only `flag.ts` reads the env var.
2. **Per-slice flags** (e.g. `NEXT_PUBLIC_SYNC_PULL`, `…_POKE`) — finer control but combinatorial,
   easy to leave in an inconsistent half-on state, and no single "is the engine live?" answer.
3. **A build-time constant / bundler define** — smaller runtime cost but harder to flip in an
   environment without a rebuild, and less testable.

### Decision
Option 1. `NEXT_PUBLIC_SYNC_ENGINE === "1"` behind `isSyncEngineEnabled()`. It is the **only** place
the env var is read; every other file (provider, later pusher/puller/poke) branches on the helper.
Flag off = today's TanStack Query notes path, unchanged.

### Consequences
- One boolean answers "is the engine live?" for tests, the provider, and every sibling.
- The old and new paths coexist behind the same gate during the whole migration; the old path is
  deleted only when the flag flips (Retirement plan in design.md).
- A test asserting flag-off ⇒ unchanged dashboard is a standing guard against accidental engine leakage.

## ADR-002: Engine contracts live in a new `packages/schemas/src/sync.ts`, imported by web + api

### Context
The push/pull/poke wire formats and the 14 mutation names cross the web↔api boundary and are
referenced by five sibling specs written in parallel. They need one canonical definition so client and
server can't drift, and so siblings don't invent colliding shapes.

### Options Considered
1. **A dedicated `sync.ts` module in `@yapper/schemas`, re-exported from the barrel** — consistent
   with the package's existing per-domain files (`note.ts`, `label.ts`, `share.ts`, `socket.ts`),
   pure-Zod, importable by web (browser) and api alike.
2. **A separate `@yapper/sync-contracts` package** — stronger isolation, but a new workspace package
   for a handful of schemas that already belong to the "cross-boundary contract" package; more wiring
   for no benefit.
3. **Define shapes ad hoc in each app** — exactly the drift the schemas package exists to prevent
   (violates the CLAUDE.md "never duplicate a contract shape per app" rule).

### Decision
Option 1. New `sync.ts` alongside the existing schema modules; export every `xxxSchema` next to its
`z.infer` type; re-export from `index.ts`. Reuse `noteAccessSchema` / `labelColorSchema` from
`common.ts` rather than redefining the access/palette enums.

### Consequences
- Web pusher/puller (specs 16/19) and api `/api/sync/*` (specs 16/19) validate against the same source.
- Spec 14 fixes the **envelope and the 14 names**; later specs may *extend* schemas additively but must
  not rename — the names are canonical across the cohort.
- `NoteMeta` is defined here as the wire/base shape (label **ids**, `metaVersion`); the materialized
  `db.notes` chip shape is a client concern finalized in spec 15.

## ADR-003: `rebuild()` is defined here as an exported seam (throwing stub); spec 15 implements it

### Context
The base+queue→materialize model (ADR-0003) makes `rebuild()` — recompute `db.notes` by replaying
`db.mutations` over `db.base` — the shared primitive that every local mutation and every pull calls.
Its **callers** live in specs 15/16/19; its **replay body** is genuinely spec 15's work. But those
specs need a stable symbol to import now.

### Options Considered
1. **Export a typed `rebuild()` stub from `db.ts` that throws `not-implemented`; spec 15 fills the
   body** — stable import surface immediately, and the throwing body is a tripwire against anyone
   relying on it before 15 lands (the flag already keeps it off the live path).
2. **Don't define it until spec 15** — siblings can't import a stable name; parallel work invents
   temporary shims that later collide.
3. **Implement a minimal real body now** — out of spec 14's scope (that's the materialization logic
   spec 15 owns) and risks baking in the wrong replay semantics.

### Decision
Option 1. `db.ts` exports `rebuild(): Promise<void>` documented as the shared primitive, with a
throwing body reserved for spec 15. The Dexie schema, `getClientGroupID()`, and this seam are the
whole of the local-store foundation in spec 14.

### Consequences
- Specs 15 (mutators/materialize), 16 (puller), and 19 (client mutators) import a stable `rebuild`.
- The stub can never corrupt state — it throws, and the flag keeps it out of the live path.
- Spec 15's first job is replacing the body and its goal-state test flips from "export exists" to
  "replay produces the expected `db.notes`."

## ADR-004: Mount `<SyncEngineProvider>` now as an inert, flag-gated seam inside the Query tree

### Context
Siblings 16/17/19 need a place to attach engine hooks (puller-on-focus, poke subscription, pusher
lifecycle). Adding the mount point later would touch `app/providers.tsx` in every one of those specs
and risk merge conflicts across parallel work.

### Options Considered
1. **Add a thin `<SyncEngineProvider>` now** — pass-through when the flag is off; when on, opens Dexie
   + ensures `clientGroupID`, then renders children. Siblings attach their hooks to this one seam.
2. **Let each sibling add its own provider/mount** — repeated edits to `providers.tsx`, ordering
   ambiguity, conflict-prone across parallel specs.
3. **No provider; call bootstrap imperatively from the dashboard** — scatters engine lifecycle across
   pages instead of one composition root.

### Decision
Option 1. Mount `<SyncEngineProvider>` inside `QueryClientProvider` in `app/providers.tsx`. Flag off ⇒
transparent pass-through (zero cost); flag on ⇒ Dexie open + `clientGroupID` resolved. No pusher/
puller/poke wiring in spec 14 — it is purely the seam.

### Consequences
- One composition root for all engine lifecycle; siblings add hooks inside it, not new mounts.
- Both the Query tree and the engine seam coexist for the whole migration; the flag chooses at runtime.
- `providers.tsx` is edited once (here), minimizing cross-spec conflict on a hot file.
