# 13 · Optimistic UX & Instant Notes — Implementation

## Status: complete (13a–13e done)

## Completed
- **13a — Toast + tooltip infra + refresh feedback.**
  - Deps: added `sonner` only. Tooltip uses the **unified `radix-ui`** package already installed
    (correction to design.md — no separate `@radix-ui/react-tooltip`).
  - `components/ui/tooltip.tsx`: shadcn Radix tooltip; `Tooltip` self-wraps a `TooltipProvider` so
    each usage is standalone (no app-level provider).
  - `components/ui/sonner.tsx`: theme-linked `<Toaster />` (via `useTheme().resolvedTheme`,
    bottom-right, richColors) + re-exported `toast` — the single toast seam.
  - `app/providers.tsx`: mount `<Toaster />` inside `QueryClientProvider`.
  - `components/dashboard/top-bar.tsx`: refresh button wrapped in a Tooltip ("Refresh notes"),
    `aria-label="Refresh notes"`, new `refreshing` prop → icon `animate-spin
    motion-reduce:animate-none` + button disabled while true.
  - `app/dashboard/page.tsx`: `refreshNotes()` async handler — `await invalidateQueries(noteKeys.all)`
    then `toast.success("Notes up to date")` (error toast on failure), driving a local `refreshing`
    state passed to TopBar.
  - Tests first (top-bar.test.tsx): spin class only while refreshing; disabled while refreshing;
    tooltip accessible name. 53/53 web tests pass, `tsc --noEmit` + Biome clean.

- **13b — Optimistic lifecycle + cross-view consistency.**
  - `lib/queries/optimistic.ts` (new): `useOptimisticNoteListMutation` — the TanStack triad.
    `onMutate` `cancelQueries(noteKeys.all)` → snapshots **every** list/shared slice
    (`getQueriesData` filtered to arrays, excluding `detail` objects) → applies `transform` (default:
    drop the mutated id) to each; `onError` restores all snapshots + `toast.error`; `onSuccess` fires
    optional success/Undo toast; `onSettled` `invalidateQueries(noteKeys.all)`.
  - `lib/queries/notes.ts`: archive/unarchive/trash/restore/permanent-delete rebuilt on the helper
    (removed `useNoteLifecycleMutation`). Trash → "Moved to Trash" + Undo=restore; Archive → "Note
    archived" + Undo=unarchive (ADR-004: Undo fires the inverse mutation). notes↔optimistic import
    cycle is safe (only used inside hook bodies).
  - Tests first (`notes-optimistic.test.tsx`): trash removes the note from BOTH the active slice and a
    cached `label` slice before settle (gated request); failed trash rolls back both + error-toasts;
    success toast exposes an Undo that hits `/restore`. 56/56 web tests pass, tsc + Biome clean.
  - Gotcha (memory): full web suite OOMs on default parallel vitest — run `--maxWorkers=1`.

- **13c — Optimistic labels.** `lib/queries/labels.ts` rebuilt:
  - `useCreateLabel`: `onMutate` appends a temp-id label to `labelKeys.all`; `onSuccess` swaps temp
    for the server row; `onError` rollback + toast; `onSettled` invalidate.
  - `useDeleteLabel`: `onMutate` removes the label + strips its chip from every cached note slice
    (via exported `noteListSlices`); `onError` restores both; success toast "Label deleted".
  - `useSetNoteLabels`: `onMutate` resolves `labelIds`→chips from the labels cache, rewrites the
    note's chips across all slices, and drops it from a label-filtered slice it no longer matches;
    `onError` rollback + toast.
  - `noteListSlices` exported from `optimistic.ts` for reuse. Tests first
    (`labels-optimistic.test.tsx`): create appends before settle; delete removes label + strips
    chips; set rewrites chips from cache. 59/59 web tests pass, tsc + Biome clean.

- **13d — Instant note creation (priority).**
  - `app/dashboard/page.tsx`: `createAndOpen` no longer awaits before opening — sets `creating`
    (opens the dialog shell at once), fires create in parallel, seeds `noteKeys.detail` from the
    response (synthesized `createdAt`/`preview`/`isOwner` — no GET), then binds the editor via
    `createdId`/`dialogNoteId`. Reject path closes the shell + `toast.error`. `closeDialog` clears
    both ids.
  - `components/dashboard/note-dialog.tsx`: `creating`/`assumeEditable` props; opens on `creating`,
    shows a "Creating note…" shell until the id resolves, forwards `assumeEditable` to the editor.
  - `app/notes/[id]/Editor.tsx`: `assumeEditable` seeds `permission:"edit"` on mount (typable before
    the socket confirms); downgrade path has **two triggers** — identity `view` (existing onStateless)
    AND auth-failure/`denied` (`onAuthenticationFailed` now resets to `view` + toasts, since `none`
    sends no identity message). Safe: socket enforces `readOnly` server-side.
  - Tests first: dashboard instant-open (dialog+shell before create resolves) + reject closes+toasts;
    Editor editable-first + both downgrade triggers (mocked provider/tiptap, asserted via the store).
    64/64 web tests pass, tsc + Biome clean.
- **13e — Pinterest masonry grid.** `components/dashboard/note-section.tsx`: grid → CSS `columns-1
  sm:columns-2 lg:columns-3 xl:columns-4` with a `mb-3.5 break-inside-avoid` wrapper per card;
  variable-height skeletons (`SKELETON_HEIGHTS` literal classes). Test first (columns classes, not
  grid-cols; one break-avoid wrapper per note). 65/65 web tests pass, tsc + Biome clean.

## Spec complete. All five slices landed, each goal-state-tested first (TDD). `apps/web`-only as
scoped (ADR-007). Deferred items in future-work.md.

## In Progress

## Blocked

## Next Steps
All five slices (13a–13e) ✅ done. Remaining before merge:
1. Commit (per-slice commits matching the "each slice = its own PR" convention, or one commit — user's call).
2. Browser verify the visual/perceived-instant behaviors (instant create, trash+Undo, masonry) —
   needs the full stack up (Next + api + socket + Neon/Upstash); tests cover the logic.
3. Optional: generate `docs/` screenshots (see prompts.md).

## Session Notes

### 2026-07-04
- Spec written after a `/grill-with-docs` design interview (design.md, decisions.md, CLAUDE.md,
  future-work.md, prompts.md). Branch: `feat/optimistic-ux` (off `feat/note-lifecycle-labels`).
- Scope locked to `apps/web` only (ADR-007) — the six issues are perceived-performance/UX; backend
  already returns the right data and enforces the rules.
- Key confirmations from the codebase:
  - Socket enforces read-only server-side (`apps/socket/src/auth.ts` `readOnly: permission === "view"`,
    `index.ts` "client editable is UX only") → editable-first (ADR-006) can't bypass authorization.
  - `POST /api/notes` is a single insert returning `{id,title,access,updatedAt}` (a `noteSummary`
    subset) → cache-seed synthesizes `createdAt`/`preview`/`isOwner`.
  - Lists are keyed per `(filter, labelId)` (`noteKeys.list`) → several slices cached at once; the
    cross-view bug (#2) is fixed by transforming **all** slices in `onMutate` (ADR-002).
- Context7 (TanStack Query) confirmed the optimistic contract: `onMutate` cancel+snapshot+setQueryData
  / `onError` rollback / `onSettled` invalidate.
- Implemented all five slices (13a–13e) in one session, TDD per slice (RED→GREEN), each verified
  with `tsc --noEmit` + Biome. Final: 65/65 web tests pass. Ran the full suite with `--maxWorkers=1`
  (default parallel run OOMs on this machine — see memory). Not yet committed; no browser verify yet.
- Spec correction during impl: Tooltip uses the already-installed unified `radix-ui` (no separate
  `@radix-ui/react-tooltip`); only `sonner` was added.
