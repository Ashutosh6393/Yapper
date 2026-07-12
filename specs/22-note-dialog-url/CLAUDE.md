# CLAUDE.md — 22 · Note Dialog URL

## Project Context

The note editor already opens in a dashboard **modal** (branch `feat/editor-toolbar`), but the dialog is
driven by local `useState` and the `?note=<id>` param is stripped on arrival, so the URL never reflects
the open note. This spec makes `/dashboard?note=<id>` the single source of truth for the dialog: URL =
state. `apps/web` only — one file (`app/dashboard/page.tsx`) + its test. No new routes/deps, no
API/DB/socket/contract changes.

## Before Starting Work

1. Read `specs/22-note-dialog-url/design.md` (goal state + the exact edits).
2. Check `implementation.md` for progress.
3. Look at existing patterns in:
   - `apps/web/app/dashboard/page.tsx` — the strip effect (~lines 109-117), `dialogNoteId` state,
     `createAndOpen`, `closeDialog`, `navigate`, `NoteSection onOpen`
   - `apps/web/components/dashboard/note-dialog.tsx` — the dialog (unchanged; reads `noteId`)
   - `apps/web/app/dashboard/page.test.tsx` — harness mocks `router.push` + controllable
     `useSearchParams`

## Code Patterns

- **Dialog state = URL:** `const dialogNoteId = searchParams.get("note")`. Delete the strip effect.
- **Open/close = `router.push`** built from `new URLSearchParams(searchParams)` (set/delete `note`), so
  the active `view`/`label` survives.
- **Keep `creating` + `createdId` in `useState`** — instant-create shell + `assumeEditable` aren't
  URL-derivable. On create resolve → `openNote(id)`.
- **TDD:** failing goal-state test first; green + `tsc --noEmit` + Biome before done. Run web tests from
  `apps/web` with `bunx vitest run --maxWorkers=1` (full suite OOMs on default parallel).

## Don't

- Don't add intercepting routes / a `/notes/<id>` path modal (future-work).
- Don't touch `notes/[id]/page.tsx`, `NoteDialog`, `Editor.tsx`, `share/[token]`, or any
  API/DB/socket/Zod contract.
- Don't reintroduce local `dialogNoteId` state — the URL is the source of truth.
- Don't skip tests.
