# CLAUDE.md — 13 · Optimistic UX & Instant Notes

## Project Context

Make the dashboard feel instant. Convert note/label mutations from refetch-then-update to
**optimistic** (`onMutate`/`onError`/`onSettled`), fix cross-view staleness, add `sonner` toasts +
Undo, give the refresh control a tooltip/spin/toast, open a brand-new note **instantly**
(optimistic open + editable-first), and switch the note grid to a **Pinterest CSS-columns masonry**.
`apps/web` only — no API/DB/socket/contract changes. Ships as five dependency-ordered slices
(13a infra → 13b lifecycle → 13c labels → 13d instant-create → 13e masonry), each a reviewable PR
with a goal-state test first.

## Before Starting Work

1. Read `specs/13-optimistic-ux-and-instant-notes/design.md` (goal state + per-slice detail).
2. Read `decisions.md` (ADR-001…007 — the *why*).
3. Check `implementation.md` for current progress and the next slice.
4. Look at existing patterns in:
   - `apps/web/lib/queries/notes.ts` + `labels.ts` (the hooks to make optimistic; `noteKeys`/`labelKeys`)
   - `apps/web/app/dashboard/page.tsx` (`createAndOpen`, mutation wiring)
   - `apps/web/components/dashboard/{note-section,note-card,top-bar,label-editor}.tsx`
   - `apps/web/app/notes/[id]/Editor.tsx` + `lib/stores/editor.ts` (editable-first + downgrade)
   - `apps/web/app/providers.tsx` (mount `<Toaster />` + `TooltipProvider`)
   - `apps/socket/src/auth.ts` (read-only is server-enforced — proves editable-first is safe)

## Code Patterns

- **Optimism = the TanStack docs pattern:** `onMutate` → `cancelQueries` + snapshot
  (`getQueriesData`) + `setQueriesData`; `onError` → restore every snapshot pair + `toast.error`;
  `onSettled` → `invalidateQueries`. Never skip `cancelQueries` or `onSettled`.
- **Cross-view:** transform/snapshot **all** matching list slices (`{ queryKey: noteKeys.all }`),
  not just the active one (ADR-002).
- **One optimistic helper** (`lib/queries/optimistic.ts`) for the five lifecycle mutations; labels
  reuse the snapshot/restore shape.
- **Toasts through `components/ui/sonner`** only. Error on every failure; success only for
  meaningful/undoable actions. **Undo = fire the inverse mutation** (ADR-004), never re-add to cache.
- **Instant create:** don't `await` before opening; seed `noteKeys.detail`/list from the create
  response (synthesize `createdAt`/`preview`/`isOwner`); `Editor` `assumeEditable` for the creator +
  socket-driven downgrade. Safe because the socket enforces `readOnly` (ADR-006).
- **Masonry:** CSS `columns-1 sm:columns-2 lg:columns-3 xl:columns-4` + card `break-inside-avoid`;
  no JS lib (ADR-005).
- **State ownership:** TanStack Query = lists/labels; `useState` = search/menu/dialog/pending-editor;
  URL = active view. Editor store stays UI-only.
- **No `as any`** — type transforms with `NoteSummary[]`/`Label[]` from `@yapper/schemas`.
- **TDD:** failing goal-state test first per slice; green + `tsc --noEmit` + Biome before done.
  **Run web tests from `apps/web`** (`bun test`).

## Don't

- Don't touch `apps/api`, `apps/socket`, `packages/*`, the DB, or Zod contracts. If a change seems to
  need one, stop and re-scope (ADR-007).
- Don't update only the active list slice — that's the cross-view bug (ADR-002).
- Don't `parse` the synthesized create-seed against the Zod schema (it's a subset; refetch reconciles).
- Don't re-add rows to the cache in Undo — fire the inverse mutation.
- Don't toast on every trivial interaction — error-always, success-selectively.
- Don't gate the creator's typing on the socket `identity` message; do keep the downgrade path.
- Don't add a JS masonry dependency or Motion enter/leave animations this spec (future-work).
- Don't put server data in Zustand or skip tests.
