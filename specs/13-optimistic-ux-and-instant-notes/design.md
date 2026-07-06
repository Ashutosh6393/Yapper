# 13 · Optimistic UX & Instant Notes — Design

Make the dashboard *feel* instant. Today every note/label action round-trips to the server and only
then refetches before the UI changes (`onSuccess: invalidateQueries` everywhere), and opening a new
note blocks on POST → GET → socket handshake before you can type. This spec makes mutations
optimistic, adds toast feedback, fixes cross-view staleness, gives the refresh control a tooltip +
state, opens a brand-new note instantly, and switches the note grid to a Pinterest-style masonry.

No API, DB, or socket changes — this is an **`apps/web`-only** spec built on top of spec 12.

This ships as **one feature, five dependency-ordered slices (13a–13e)**. Each slice is its own
reviewable PR with a goal-state test written first (TDD).

## Goal State (acceptance)

**Feedback infra (13a)**
1. `sonner` `<Toaster />` is mounted app-wide (theme-aware via next-themes); a shared `toast` helper
   is the single way the dashboard surfaces success/error events.
2. Every mutation failure raises an error toast; the UI never silently swallows a rejected mutation.
3. The top-bar refresh control has a tooltip ("Refresh notes"), its icon **spins while a refresh is
   in flight**, and a success toast ("Notes up to date") fires when the refetch settles.

**Optimistic lifecycle + cross-view consistency (13b)**
4. Archive / Unarchive / Move to Trash / Restore / Delete forever apply **optimistically**: the card
   leaves the current view on click (no wait for the server), rolls back + error-toasts on failure,
   and reconciles via `onSettled` invalidate.
5. The mutation removes the note from **every** cached note-list slice it appears in (all
   `filter`+`label` slices), so a note trashed while a **label view** is also cached disappears from
   that label view immediately — not "after some time" (fixes issue #2).
6. Trash and Archive success toasts carry an **Undo** action that fires the inverse mutation (itself
   optimistic), restoring the card instantly.

**Optimistic labels (13c)**
7. Create label, delete label, and set-a-note's-labels apply optimistically against the labels cache
   and the note-list slices (chips + counts update on click), with rollback + error toast on failure.
8. Deleting a note's label / removing a label from a note updates the note's chips and the sidebar
   count **without** waiting for a refetch; removing the label a filtered view is showing drops the
   note from that view immediately.

**Instant note creation (13d)**
9. Clicking **New note** (sidebar button or the "Start a new note…" field) opens the editor
   **immediately** — the editor shell renders and the caret is typable before the network settles.
10. The `POST /api/notes` runs in parallel; its response seeds the `useNote` + list caches (no
    blocking GET). The Hocuspocus provider attaches once the real id resolves and the local Yjs doc
    syncs on connect.
11. The creator can type at once: editability for a just-created owned note is assumed (`edit`)
    rather than gated on the socket `identity` message. If the socket resolves a lower permission
    the editor **downgrades to read-only** and toasts — via **either** an `identity` message saying
    `view` **or** an auth-failure/`denied` status (the `none` case sends no `identity` message). The
    socket remains the server-side authority: `none` rejects the connection and `view` is enforced
    `readOnly` regardless of the client (spec 04 ADR-003).
12. A create failure closes the optimistic editor, rolls the seeded note out of the caches, and
    error-toasts.

**Pinterest masonry grid (13e)**
13. The note grid is a **masonry / Pinterest-style** layout: cards keep their natural (variable)
    height and tile into responsive columns (1 / 2 / 3 / 4 by breakpoint) with no fixed row height
    and no horizontal scroll. Loading skeletons are variable-height to match.

## Scope

**In:** `apps/web` only — `sonner` + shadcn `tooltip`; a shared `toast` helper; an optimistic
mutation helper for the note-list cache; optimistic rewrites of the lifecycle + label Query hooks;
refresh-control tooltip/spin/toast; instant-open note creation (dashboard `createAndOpen` + `Editor`
editable-first + cache seeding); masonry `NoteSection`.

**Out (see future-work.md):** any API/DB/socket change; optimistic **create-note ordering** across
multiple rapid creates; offline mutation queue / retry beyond TanStack defaults; toast
de-duplication/queuing policy; masonry virtualization for very large lists; drag-to-reorder;
animating card enter/leave with Motion (kept to CSS for now); a global error boundary.

---

## Slice 13a — Toast + tooltip infra + refresh feedback

`apps/web`:
- **Deps:** add `sonner` only. Tooltip uses the **unified `radix-ui`** package already installed
  (existing ui components import `{ X as XPrimitive } from "radix-ui"`) — no `@radix-ui/react-tooltip`.
- **`app/providers.tsx`:** mount `<Toaster />` (from the seam) inside the tree, `richColors`,
  `position="bottom-right"`, and theme-linked so it follows next-themes (`resolvedTheme` from
  `useTheme`). One instance, app-wide.
- **`components/ui/sonner.tsx`:** shadcn's `Toaster` wrapper re-exporting `toast`. The dashboard
  imports `toast` from here, never from `sonner` directly (single seam).
- **`components/ui/tooltip.tsx`:** shadcn Radix tooltip primitives (`TooltipProvider`, `Tooltip`,
  `TooltipTrigger`, `TooltipContent`), `Tooltip` self-wraps a `TooltipProvider` so each usage is
  standalone (no app-level provider needed).
- **`components/dashboard/top-bar.tsx`:** wrap the refresh `Button` in a `Tooltip` ("Refresh notes").
  Add a `refreshing` boolean prop → `RefreshCw` gets `animate-spin motion-reduce:animate-none` while
  true. `onRefresh` becomes async: the page passes a handler that
  `await queryClient.invalidateQueries({ queryKey: noteKeys.all })` then `toast.success("Notes up to
  date")`; the button tracks pending via `useIsFetching({ queryKey: noteKeys.all })` (or a local
  `isPending` state around the await) to drive the spin.

**Tests (13a, first):** top-bar test — refresh button has an accessible tooltip label; icon carries
the spin class while `refreshing`; clicking calls `onRefresh`. (Sonner rendering is smoke-tested via
the provider; toast *content* per action is asserted in 13b/13c where the calls live.)

---

## Slice 13b — Optimistic lifecycle + cross-view consistency

`apps/web`:
- **`lib/queries/optimistic.ts` (new):** a `useOptimisticNoteListMutation` factory that wraps
  `useMutation` with the docs' `onMutate`/`onError`/`onSettled` pattern for the note-list cache:
  - `onMutate(id)`: `await qc.cancelQueries({ queryKey: noteKeys.all })`; snapshot **all** list
    slices via `qc.getQueriesData<NoteSummary[]>({ queryKey: [...noteKeys.all] })` (filtered to
    `list`/`shared` slices); apply the caller's transform (default: **remove the note id** from every
    slice) with `qc.setQueriesData`; return `{ snapshots }`.
  - `onError(_e, _v, ctx)`: restore every `[key, data]` snapshot; `toast.error(...)`.
  - `onSettled`: `qc.invalidateQueries({ queryKey: noteKeys.all })`.
  - Params: `mutationFn`, `errorMessage`, optional `onSuccessToast` (message + optional Undo action),
    optional custom `transform` (delete-forever, restore, etc. all use "remove from lists"; kept as a
    seam for 13c reuse).
- **`lib/queries/notes.ts`:** re-implement `useArchiveNote`/`useUnarchiveNote`/`useTrashNote`/
  `useRestoreNote`/`usePermanentDelete` on top of the factory. Archive & Trash pass an `onSuccessToast`
  with an **Undo** that calls the inverse hook's `mutate` (unarchive / restore). Keep the endpoints
  and `noteKeys` unchanged.
- **`app/dashboard/page.tsx`:** no structural change — the handlers already call `.mutate(id)`. Undo
  wiring is internal to the hooks (they receive/close over the inverse mutation), so the page stays
  thin.

**Design notes**
- Every lifecycle action results in the note **leaving the currently-cached list(s)** (archive →
  gone from active + any label slice; unarchive → gone from archive; restore/delete → gone from
  trash). So "remove id from all list slices" is the correct universal optimistic transform; the
  authoritative membership of the destination view is filled by the `onSettled` refetch.
- Undo must fire the inverse mutation (which re-inserts via its own `onSettled`), **not** re-add to
  the cache directly — that keeps a single source of truth and avoids resurrecting a row the server
  rejected.

**Tests (13b, first):** hook tests (React Query `renderHook` + a mock `apiFetch`) — trashing a note
that exists in **both** the `active` slice and a `label` slice removes it from **both** on
`onMutate`; a rejected mutation restores both snapshots and calls `toast.error`; the success toast
for trash exposes an Undo action that triggers the restore mutation.

---

## Slice 13c — Optimistic labels

`apps/web`:
- **`lib/queries/labels.ts`:**
  - `useCreateLabel`: `onMutate` appends an optimistic label (temp id, `noteCount: 0`) to
    `labelKeys.all`; `onError` rolls back + `toast.error`; `onSuccess` swaps the temp row for the
    server row; `onSettled` invalidates `labelKeys.all`.
  - `useDeleteLabel`: `onMutate` removes the label from `labelKeys.all` **and** strips that label
    from every note's `labels[]` across the note-list slices; `onError` restores both; `onSettled`
    invalidates `labelKeys.all` + `noteKeys.all`.
  - `useSetNoteLabels`: `onMutate` rewrites the target note's `labels[]` (resolving `labelIds` →
    label chips from the `labelKeys.all` cache) across every list slice, adjusts affected label
    counts, and drops the note from a `label`-filtered slice it no longer matches; `onError`
    restores; `onSettled` invalidates both keys.
- **`components/dashboard/label-editor.tsx`:** unchanged behavior — it already calls the hooks; the
  optimism lives in the hooks so the editor's Save feels instant. Error toasts replace the silent
  `catch {}` swallow (the hook toasts; the editor keeps its keep-open-on-failure behavior).

**Design notes**
- `label`-filtered note slices key off `noteKeys.list("active", labelId)`; resolving chips from the
  labels cache avoids a second server shape. If the labels cache is cold, fall back to invalidate-only
  for that mutation (no optimistic chip text) rather than guessing.
- Counts are best-effort optimistic; `onSettled` is the source of truth.

**Tests (13c, first):** label hook tests — create shows the temp label immediately and reconciles on
success; delete removes the label + strips chips from cached notes and rolls back on error;
set-note-labels updates a note's chips across slices and error-toasts on failure.

---

## Slice 13d — Instant note creation

`apps/web`:
- **`app/dashboard/page.tsx` `createAndOpen`:** stop `await`ing before opening. Flow:
  1. Optimistically open: set a **pending editor** state and show the editor shell right away.
  2. Fire `createNote.mutateAsync()` in parallel. On resolve, seed the caches:
     `qc.setQueryData(noteKeys.detail(id), <NoteMetadata from response + isOwner:true, preview:"",
     createdAt:=updatedAt>)` and prepend the new `NoteSummary` to the active list slice; set
     `dialogNoteId` to the real id so the modal/editor binds to it.
  3. On reject: close the pending editor, remove any seeded row, `toast.error`.
- **`components/dashboard/note-dialog.tsx`:** accept the pending state so the dialog can open before
  an id exists (render the editor shell / a lightweight skeleton for the ~1 insert round-trip), then
  bind `Editor` once the id resolves.
- **`app/notes/[id]/Editor.tsx`:** add an optional `assumeEditable` (owner-created) signal. When set,
  seed the editor store `permission: "edit"` and render `editable` immediately instead of waiting for
  the socket `identity` message. The provider still attaches by `noteId`; typing into the local Yjs
  doc before connect is fine (syncs on connect). Non-created / shared opens keep today's gated
  behavior (`assumeEditable` unset).
- **Downgrade path — two triggers (both required):**
  1. **`identity` says lower** — `onStateless` already applies the server's `permission`; the
     `setEditable(permission === "edit")` effect flips the surface to read-only when it's `view`.
  2. **Auth failure / denied** — when `permission === "none"` the socket **throws in `onAuthenticate`
     and never sends an `identity` message** (client gets `onAuthenticationFailed` →
     `setStatus("denied")`). So the downgrade must **also** fire on `denied`/`disconnected` status
     for an `assumeEditable` session: force `setEditable(false)` and surface it (toast + read-only
     notice). Without this, the optimistically-editable surface would linger with no identity message
     ever arriving to correct it. (Near-unreachable for a fresh own note — creator = owner = `edit` —
     but required for correctness.)

**Design notes**
- Safe because the socket enforces authorization on **two** server-side gates: `none` **rejects the
  connection** (`authorizeConnection` throws — `apps/socket/src/auth.ts:53`), and `view` sets
  `connection.readOnly = true` so Hocuspocus **drops the connection's inbound doc updates**
  (`index.ts:73`). Client `editable` is UX-only (spec 04 ADR-003). Optimistic editability can never
  bypass either gate — worst case the writes don't sync and the UI downgrades (both triggers above).
- Seeding `noteMetadataSchema` from the `createNoteResponseSchema` response requires synthesizing
  `createdAt` (= `updatedAt`), `preview` (`""`), `isOwner` (`true`) — all known for a fresh own note.
- Keep the modal-based open (spec 12c) — this slice makes it instant, it does not move to a full page.

**Tests (13d, first):** dashboard test — clicking New note renders the editor **before**
`createNote` resolves (mutation still pending) and the editor mounts editable; a create rejection
closes the editor and toasts. Editor test — with `assumeEditable`, the editor is editable before any
`identity` stateless message; a later `view` identity downgrades it to read-only (trigger a); and a
`denied`/auth-failed status (no identity message) **also** downgrades it to read-only (trigger b).

---

## Slice 13e — Pinterest masonry grid

`apps/web`:
- **`components/dashboard/note-section.tsx`:** replace the fixed `grid grid-cols-*` + `h-32`
  skeletons with a CSS **columns** masonry: container
  `columns-1 sm:columns-2 lg:columns-3 xl:columns-4 gap-3.5`; each card wrapper
  `mb-3.5 break-inside-avoid` so cards keep natural height and tile top-of-shortest-column. Skeletons
  become a handful of variable-height blocks. The card component itself is unchanged (it already
  sizes to content).

**Design notes**
- CSS `columns` fills column-by-column (a card's neighbors are its column-mates, not strict DOM
  order). Acceptable for note cards; a JS masonry lib (strict DOM order) is out of scope
  (future-work) — no dependency, no layout-thrash on resize.
- Verify no horizontal overflow at each breakpoint and that `break-inside-avoid` prevents card
  splitting across columns.

**Tests (13e, first):** note-section test — the grid container carries the `columns-*` classes (not
`grid-cols-*`) and renders one wrapper per note; empty + loading states still render.

---

## Cross-cutting rules (all slices)
- **`apps/web` only.** No changes to `apps/api`, `apps/socket`, `packages/*`, DB, or Zod contracts.
  If a change seems to need one, stop — it's out of scope for this spec.
- **Optimistic pattern = the TanStack docs pattern:** `onMutate` (cancel → snapshot → `setQueryData`)
  / `onError` (rollback from snapshot) / `onSettled` (invalidate). Never skip the `cancelQueries` or
  the `onSettled` reconcile.
- **State ownership unchanged:** TanStack Query owns lists/labels; `useState` owns
  search/menu/dialog/pending-editor; the URL owns the active view. No server data in Zustand (the
  editor store stays UI-only).
- **Toasts through one seam** (`components/ui/sonner`), not scattered `sonner` imports. Error on every
  failure; success only for meaningful/undoable actions — no toast spam.
- **No `as any`.** Type the cache transforms with `NoteSummary[]` / `Label[]` from `@yapper/schemas`.
- **Theme:** semantic tokens only; toaster + tooltip follow the app theme. No `globals.css` token
  changes.
- **TDD:** write the failing goal-state test first for each slice; mark a slice done only when green
  (`bun test` in `apps/web`), `tsc --noEmit` clean, Biome clean. Run web tests from `apps/web`.

## Risks / notes
- **Editable-first correctness (13d):** the only window is between optimistic open and the socket
  `identity` — the socket rejects/downgrades if the client is wrong, so data can't leak, but the UX
  must handle the downgrade gracefully (read-only surface + toast). Covered by goal #11 and a test.
- **Cache-seed shape drift (13d):** `createNoteResponse` is a subset of `noteMetadata`/`noteSummary`;
  the synthesized fields must match the Zod shapes or a later `parse` on refetch is the safety net
  (`onSettled` invalidate refetches the real row). Don't `parse` the synthetic seed.
- **Optimistic label chips need the labels cache (13c):** if it's cold, degrade to invalidate-only
  for that action rather than rendering wrong chip names.
- **CSS columns ordering (13e):** column-fill order ≠ strict DOM/`updatedAt` order within a row;
  accepted tradeoff (ADR-005). Revisit with a JS masonry lib only if ordering complaints surface.
- **Undo re-entrancy (13b):** Undo fires the inverse mutation; double-clicking Undo or acting on a
  mid-flight card is bounded by the mutations' own `onSettled` reconcile — no manual guard needed, but
  don't hand-re-add rows to the cache in Undo.
