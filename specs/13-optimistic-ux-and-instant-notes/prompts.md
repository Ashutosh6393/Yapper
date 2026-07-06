# 13 · Optimistic UX & Instant Notes — Prompts

## Continue Feature
Continue working on spec 13 (optimistic-ux). Read
`specs/13-optimistic-ux-and-instant-notes/implementation.md` for the current slice, then the matching
slice section in `design.md`. Write the goal-state test first (TDD). Run web tests from `apps/web`.

## Sync Implementation Status
Review what's implemented for spec 13 and update
`specs/13-optimistic-ux-and-instant-notes/implementation.md` (Completed / In Progress / Next Steps +
a dated Session Note).

## Implement a Slice (TDD)
Implement slice 13{a|b|c|d|e} per `design.md`. First write the failing goal-state test named in that
slice, then the minimal code to green it. Keep the optimistic pattern (`onMutate` cancel+snapshot+set /
`onError` rollback / `onSettled` invalidate). `apps/web` only — no API/DB/socket/contract changes.
Finish with `bun test` (from `apps/web`), `tsc --noEmit`, and Biome all clean.

## Code Review
Review the slice diff for: the full optimistic triad (no missing `cancelQueries`/`onSettled`),
all-slice snapshot/rollback (not just the active slice), no `as any`, toasts through the
`components/ui/sonner` seam, editable-first downgrade path intact, and scope (no backend touch).

## Generate Docs with Screenshots
Generate `specs/13-optimistic-ux-and-instant-notes/docs/README.md` with screenshots of: an optimistic
trash + Undo toast, the refresh spin/tooltip, the instant editor open, and the masonry grid. Save to
`docs/screenshots/`.
