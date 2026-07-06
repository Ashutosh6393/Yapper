# 20 · Content Lane Implementation

## Status: not-started

## Completed

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
