# 20 · Content Lane Implementation

## Status: done

## Completed

- **Shared helper** — `packages/editor/src/collab.ts` → `deriveNoteMetadata(doc)` on the new
  `@yapper/editor/collab` subpath (`TiptapTransformer.fromYdoc` + `extractTitlePreview`); added
  `@hocuspocus/transformer` dep. Parity test (`collab.test.ts`).
- **Socket refactor** — `apps/socket/src/metadata.ts` `saveDerivedMetadata` now calls
  `deriveNoteMetadata` (no behavior change); `persistence.test.ts` stays green.
- **Schema** — `putNoteContentBodySchema` (`{ state: base64 }`) + type in `packages/schemas/src/note.ts`;
  test.
- **API** — `PUT /api/notes/:id/content` (`apps/api/src/notes/router.ts`): parse → gate
  `resolvePerm === "edit"` (403/deny-by-default for unknown) → upsert `note_doc` (same row Hocuspocus
  writes) → derive via the shared helper → bump `meta_version` → 204. Added `yjs` +
  `@hocuspocus/transformer` + `@yapper/editor` deps. 5 tests (`content.test.ts`): private persist+derive
  **without a socket** + meta_version bump; upsert-not-duplicate; view-collaborator 403; unknown 403;
  malformed 400.
- **Web controller** — `apps/web/lib/sync/content-sync.ts` `ContentSync`: one `Y.Doc` per note with
  y-indexeddb **always attached**; exactly one writer by access (private ⇒ debounced `PUT /content`,
  shared ⇒ injected Hocuspocus provider); `setAccess` sequences handoff teardown→setup (zero overlap);
  transient flush failures are swallowed + retried. Added `y-indexeddb` dep. 5 tests
  (`content-sync.test.ts`): single-writer both ways, handoff both directions, offline durability (real
  y-indexeddb via fake-indexeddb).
- **Editor wiring** — `Editor.tsx` split into a flag dispatcher: flag-off ⇒ untouched `LegacyEditor`
  (Editor.test.tsx green, goal #13); flag-on ⇒ `ContentLaneEditor` driving `ContentSync` from
  `db.notes` access (useLiveQuery), binding TipTap to the controller's doc, rendering presence/caret
  only while shared.

Verify: `tsc --noEmit` clean in editor/web/socket/api (schemas only the pre-existing unrelated
`common.test.ts` error); Biome clean. Tests: editor 8, schemas 42, socket 3, api notes 24, web sync +
Editor 75 — all green.

## In Progress

## Blocked

- Depends on **spec 14** (flag + `@yapper/schemas` for `putNoteContentBodySchema`), **spec 15**
  (`db.notes`/`useLiveQuery` so the controller observes access level for the public→private handoff),
  **spec 16** (owns `note.meta_version` — this spec bumps it — and the pull that turns the bump into a
  list update), **spec 19** (`setShareLevel`/`makePrivate` access transitions + the optimistic metadata
  effect the local derive feeds), and **spec 18** (the note `id` used as the `y-indexeddb` doc name).

Build order: ships **last** — **14 → 15 → 18 → 19 → 16 → 21 → 17 → 20.** Behind the flag, so nothing
affects prod until the whole sequence is green and the flag flips (a flag-flip criterion is "the content
lane persists private notes and re-derives title/preview").

## Next Steps

1. `packages/editor`: add `src/collab.ts` → `deriveNoteMetadata(doc)` exported from a new
   `@yapper/editor/collab` subpath (test first: parity with `extractTitlePreview` over the transform).
2. Refactor `apps/socket/src/metadata.ts` `saveDerivedMetadata` onto `deriveNoteMetadata` (existing
   socket metadata test stays green — regression guard).
3. `packages/schemas`: add `putNoteContentBodySchema` + type + barrel.
4. `apps/api/src/notes/router.ts`: `PUT /:id/content` — parse → gate `resolvePerm === "edit"` → upsert
   `note_doc.state` (like `saveDocState`) → derive via helper → bump `meta_version` → 204 (tests first:
   private persist+derive without socket, permission/validation, upsert-not-duplicate).
5. `apps/web/lib/sync/content-sync.ts` + `Editor.tsx`: `y-indexeddb` always-attached, single-writer
   controller (private REST flush / shared Hocuspocus), two-direction handoff, optimistic local title
   (tests first: single-writer, handoff both directions, offline durability).
6. Add `y-indexeddb` to `apps/web`; `@hocuspocus/transformer` + `yjs` to the editor server subpath / api.
7. Green + `tsc --noEmit` clean (web/api/socket/editor/schemas) + Biome clean. Web from `apps/web`
   (`--maxWorkers=1`, `fake-indexeddb`); api/socket/editor with `bun test` from each dir.

## Session Notes

- **New deps added:** `@hocuspocus/transformer` (editor, api), `yjs` (api), `y-indexeddb` (web), and
  `@yapper/editor` as an **api** workspace dep (api didn't depend on it before — the collab subpath
  wouldn't resolve until it was added + a root `bun install`).
- **`PUT /content` gates on `resolvePerm === "edit"`, so an unknown note → 403, not 404** (deny-by-default;
  the design's handler pseudocode explicitly folds 404-as-none into the 403). The route is placed before
  `DELETE /:id` in the notes router.
- **Controller is dependency-injected** (`createProvider`, `flush`, `createPersistence`) so the
  single-writer/handoff tests use mocks and only the offline test touches real y-indexeddb — that's what
  makes the goal states unit-testable without a live Hocuspocus/socket. Editor supplies the real
  HocuspocusProvider factory.
- **Goal #12 (optimistic local title) is wired as a seam, not activated.** `ContentSync` accepts an
  `onLocalDerive` hook, but the Editor doesn't pass one yet: there's no clean spec-19 primitive to set a
  *content-derived* title/preview locally without either enqueuing a server mutation (wrong — server
  derives from content) or writing puller-only `db.base`. The server derive + `meta_version` bump + poke
  (spec 17) already propagate the title near-instantly; the zero-latency optimistic paint is deferred to
  a spec-19 content-derive effect. Noted as the one goal-state item left as a seam.
- **Editor render path is behind the flag and not unit-tested** (no goal-state test targets it; the spec
  keeps the flag off in prod until the whole engine is verified). Its correctness rests on the tested
  `ContentSync` controller + server + the untouched flag-off `LegacyEditor`. Manual e2e is the flag-flip
  gate (spec 14).
- Ran web tests with `bunx vitest run --no-file-parallelism`; api/socket/editor with `bun test` per dir.
- Not committed — awaiting user go-ahead.
