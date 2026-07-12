# 22 · Note Dialog URL — Implementation

## Status: not-started

## Completed

## In Progress

## Blocked

## Next Steps

1. Write goal-state tests in `app/dashboard/page.test.tsx` (card-open pushes `?note=`; deep-link
   `?note=` renders dialog; close strips `note` and keeps `view`; open preserves `view`).
2. `app/dashboard/page.tsx`: derive `dialogNoteId` from `searchParams.get("note")`; delete the strip
   effect; add `openNote`/`closeDialog` that push merged params; wire `NoteSection onOpen` + create
   flow to `openNote`; keep `creating`/`createdId` local.
3. Green + `tsc --noEmit` + Biome. Run web tests from `apps/web` (`bunx vitest run --maxWorkers=1`).

## Session Notes

- Branch: `feat/editor-toolbar` (dialog UI already present as uncommitted work).
- URL scheme chosen: query param `?note=<id>` (over intercepting-route path modal) — smallest diff,
  reuses the existing redirect + param plumbing. See ADR-001.
