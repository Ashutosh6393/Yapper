# CLAUDE.md — 20 · Content Lane

## Project Context

The **content lane** of the local-first sync engine (ADR-0008): how a note *body* persists. Note
bodies stay a Yjs CRDT. This spec makes a **private** note persist and derive its title/preview
**without opening a socket**, while never letting two writers touch the same `note_doc` row:

- `y-indexeddb` in the editor (`new IndexeddbPersistence(noteId, ydoc)`) for instant, offline-durable
  local content.
- `PUT /api/notes/:id/content` (`apps/api/src/notes/router.ts`) — body = full Yjs state; upserts
  `note_doc.state` (the same row Hocuspocus writes), derives `title`/`preview` via a **shared server
  helper**, bumps `note.meta_version` (spec 16/19) so the list updates via pull + poke.
- A **single-writer** content-sync controller in `Editor.tsx`: **private ⇒ REST only** (no socket),
  **shared ⇒ Hocuspocus only** (no REST flush), with a clean handoff both directions.
- A `deriveNoteMetadata` helper in `@yapper/editor/collab`, extracted from the socket's
  `saveDerivedMetadata`, called by **both** persistence paths so they derive identically.

Everything is behind `NEXT_PUBLIC_SYNC_ENGINE`. Flag **off** ⇒ every note (private included) uses
Hocuspocus exactly as today. Build order: ships **last** (14 → 15 → 18 → 19 → 16 → 21 → 17 → **20**).

## Before Starting Work

1. Read `specs/20-content-lane/design.md` (Goal State + endpoint + shared-helper extraction + editor
   wiring + TDD tests + Dependencies).
2. Read `decisions.md` (spec-local choices) and the governing ADR `docs/adr/0008-…` (+ `0002-…`).
3. Check `implementation.md` for progress / next step.
4. Look at existing patterns in:
   - `apps/socket/src/metadata.ts` (`saveDerivedMetadata` — the derivation to extract) +
     `apps/socket/src/persistence.ts` (`saveDocState` upsert on `noteDoc.noteId`) +
     `apps/socket/src/index.ts` (`onStoreDocument` wiring — the other caller of the helper)
   - `packages/editor/src/derive.ts` (`extractTitlePreview`, `COLLAB_FIELD`, `PmNode`) + `index.ts`
     (subpath export pattern — add `./collab` alongside `./derive`)
   - `apps/api/src/notes/router.ts` (owner-gated route shape: parse → gate → mutate; `resolvePerm`,
     `authed()`) + `apps/api/src/permissions.ts`
   - `apps/web/app/notes/[id]/Editor.tsx` (the always-Hocuspocus editor to split by access level) +
     `apps/web/lib/stores/editor.ts`
   - `packages/db/src/schema.ts` (`note`, `noteDoc`; `note.meta_version` is added by spec 16 — orient
     against it, don't add it here)
   - `packages/schemas/src/note.ts` + `index.ts` (add `putNoteContentBodySchema` + type, barrel it)

## Code Patterns

- **Shared derive helper is the single source of truth for title/preview.** `deriveNoteMetadata(doc)`
  in `@yapper/editor/collab` = `TiptapTransformer.fromYdoc(doc, COLLAB_FIELD)` + `extractTitlePreview`.
  Both `saveDerivedMetadata` (socket) and `PUT /content` (api) call it. Never re-derive inline.
- **New subpath, not `./derive`.** `derive.ts` stays TipTap/Yjs-free (runs standalone under Bun);
  `collab.ts` (`@yapper/editor/collab`) is where `@hocuspocus/transformer` + `yjs` live.
- **`PUT /content` is server-authoritative:** gate `resolvePerm(id, userId) === "edit"` (reuse
  `@yapper/permissions`, cache-first — the socket's rule); validate body with `putNoteContentBodySchema`
  from `@yapper/schemas`; the **server derives** title/preview (client never sends them); bump
  `note.meta_version`; upsert `note_doc` like `saveDocState`.
- **Single-writer invariant (correctness-critical):** private ⇒ debounced `PUT /content`, **no
  provider**; shared ⇒ `HocuspocusProvider`, **no REST flush**. Sequence handoff teardown → setup so
  exactly one writer is active at every instant. The owner is **not** kicked on make-private — the
  owner's controller must self-drive the public→private handoff.
- **One ydoc per note with `y-indexeddb` always attached** (local durability); swap only the sync
  writer on handoff, so the server blob loads (CRDT-convergent) into the same doc.
- **Optimistic title is client-only.** Local `extractTitlePreview` feeds spec 19's optimistic metadata
  effect for instant feedback; the server value overwrites on the next pull (spec 16). Don't treat the
  client value as authoritative.
- **Flag-gate the whole thing.** `isSyncEngineEnabled()` chooses the new private-REST path vs today's
  Hocuspocus-always path in `Editor.tsx`. Only `flag.ts` reads the env var.
- **No `as any`** — strict TS; type the body/response from `@yapper/schemas`.
- **TDD:** failing goal-state tests first (api PUT derive+bump, helper parity, single-writer, handoff,
  offline durability), then green + `tsc --noEmit` + Biome.

## Repo Gotchas (for the implementer)

- **jsdom has no IndexedDB.** The `y-indexeddb`/controller web tests need `fake-indexeddb` (dev-only,
  e.g. `fake-indexeddb/auto`). Keep it out of the app bundle.
- **`apps/web` full Vitest suite OOMs** on default parallel — run `bunx vitest run --maxWorkers=1` from
  `apps/web` (via Vitest, not raw `bun test`).
- **`apps/api` / `apps/socket` / `packages/editor` tests** run with `bun test` from each dir (Bun loads
  `.env` from cwd; DB-touching api tests fail at repo root with "DATABASE_URL is not set").
- **No local Docker** — DB = Neon Postgres, Redis = Upstash. api route tests hit real Postgres via
  supertest with a fake `SessionResolver` (`x-test-user-id` header).
- **`@hocuspocus/transformer` + `yjs` become `apps/api` deps** (to decode the blob + derive). Add them
  to `apps/api` / the editor server subpath; don't inline a second copy of the derivation.

## Don't

- **Don't let the client set `title`/`preview` on the server.** The server derives them via the shared
  helper — the client derive is optimistic-only. No "client sets title" trust hole (ADR-0008).
- **Don't run two writers on one note.** Never REST-flush while the provider is connected; never connect
  the provider until the flush stops. Sequence the handoff.
- **Don't forget the owner-side public→private handoff** — the owner isn't kicked, so the controller
  must tear down its own provider and resume REST on access→private.
- **Don't add `note.meta_version`, the CVR puller, the pull endpoint, or the Dexie store** — those are
  specs 16 / 15. This spec *bumps* the column and *relies on* the pull; cite them.
- **Don't define the `setShareLevel`/`makePrivate` mutators or the optimistic-metadata effect** — spec
  19 owns them; this spec triggers/calls them.
- **Don't touch realtime co-editing** (cursors/presence, the made-private kick) — orthogonal.
- **Don't re-derive title/preview inline** anywhere — always call `deriveNoteMetadata`.
- **Don't read `NEXT_PUBLIC_SYNC_ENGINE` outside `flag.ts`**, and don't break the flag-off path (every
  note uses Hocuspocus as today).
