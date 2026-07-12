# 22 · Note Dialog URL — Implementation

## Status: done — goal state reached

## Completed

- `app/dashboard/page.test.tsx`: goal-state tests (TDD, RED→GREEN) — `push` simulates navigation;
  card-open pushes `?note=`; open preserves `view`; `?note=` deep-link renders the dialog; close
  strips `note` and keeps `view`. Existing create/instant-create tests pass unchanged.
- `app/dashboard/page.tsx`: `dialogNoteId` now derived from `searchParams.get("note")` (local state
  removed); strip effect deleted; `openNote` (push merged params) + `closeDialog` (push minus `note`);
  `NoteSection onOpen` + `createAndOpen` (both flag paths) route through `openNote`; `creating`/
  `createdId` stay local.
- Verification: 15/15 dashboard tests green, `tsc --noEmit` clean, Biome clean.

## In Progress

## Blocked

## Next Steps

- Live browser walkthrough of the auth-gated dashboard (open/refresh/back) not run — needs interactive
  OAuth login. Unit tests cover the URL↔dialog behavior; drive in-browser if a manual check is wanted.

## Session Notes

- Branch: `feat/editor-toolbar` (dialog UI already present as uncommitted work).
- URL scheme chosen: query param `?note=<id>` (over intercepting-route path modal) — smallest diff,
  reuses the existing redirect + param plumbing. See ADR-001.
