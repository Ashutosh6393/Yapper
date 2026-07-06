# 13 · Optimistic UX & Instant Notes — Future Work

Deferred deliberately; not part of this spec's goal state.

## Optimism / data
- **Multi-create ordering** — rapid successive New note clicks: guarantee optimistic ordering /
  temp-id stability across concurrent creates.
- **Offline mutation queue** — persist + replay mutations beyond TanStack's default in-memory retry;
  true offline support.
- **Optimistic label recolor/rename** — once label rename/recolor exists (deferred in spec 12), give
  it the same optimistic treatment.
- **Cold-cache optimistic chips** — currently `useSetNoteLabels`/`useDeleteLabel` degrade to
  invalidate-only when the labels cache is cold; could hydrate the labels cache eagerly instead.

## Toasts
- **Toast queue/dedup policy** — collapse repeated identical toasts, cap concurrent toasts, per-action
  throttling.
- **Undo everywhere** — extend Undo to delete-forever within a short window (currently confirm-dialog
  only, and permanent), and to label delete.

## Editor / instant create
- **Pre-warmed socket pool** — optionally pre-connect a provider to shave the attach latency further
  (rejected for this spec as orphan-prone; revisit if the attach gap is noticeable).
- **Full-page instant open** — currently the modal opens instantly; a route-level instant open
  (`/notes/[id]`) with the same editable-first treatment.
- **Title-first UX** — focus a title field immediately on create before the body binds.

## Layout
- **JS masonry** — swap CSS `columns` for a DOM-order-preserving masonry lib if within-row ordering
  (`updatedAt`) matters to users.
- **Masonry virtualization** — windowing for very large note counts.
- **Motion enter/leave** — animate card add/remove/reflow with `motion/react` (kept to CSS this spec).
- **Drag-to-reorder / pin** notes.

## Cross-cutting
- **Global error boundary** — a top-level boundary so a thrown render can't blank the dashboard
  (toasts cover mutation errors only).
