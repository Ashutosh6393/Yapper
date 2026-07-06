# 13 · Optimistic UX & Instant Notes — Decisions

## ADR-001: Optimistic updates via the TanStack `onMutate`/`onError`/`onSettled` pattern (cache-level, not per-component)

### Context
Every note/label mutation used `onSuccess: invalidateQueries` — mutate, wait for the server, refetch,
*then* the UI changes. No instant feedback. We need optimism across seven mutations that share a
shape.

### Options Considered
1. **Cache-level optimism in the Query hooks** — `onMutate` cancels + snapshots + `setQueryData`,
   `onError` rolls back, `onSettled` invalidates (the documented React Query pattern). Components stay
   thin and unchanged.
2. **Component-level optimistic state** (local `useState` shadowing the list) — duplicates server
   state in the UI, fights TanStack Query, breaks cross-view consistency.
3. **`useMutationState` / variables-based optimism** — good for single-list "pending row" UIs, but
   doesn't cleanly handle a note leaving multiple cached slices.

### Decision
Option 1. Put optimism in the hooks via a shared `useOptimisticNoteListMutation` factory. Components
keep calling `.mutate(id)`; the cache is the single source of truth.

### Consequences
- One tested helper covers archive/unarchive/trash/restore/delete-forever.
- Requires `cancelQueries` (so an in-flight refetch can't clobber the optimistic write) and an
  `onSettled` reconcile on every mutation — non-negotiable parts of the pattern.

## ADR-002: One optimistic pass removes the note from ALL cached list slices (fixes cross-view staleness)

### Context
Issue #2: a note deleted elsewhere lingers under a label view "for some time." Lists are keyed per
`(filter, labelId)` (`noteKeys.list`), so several slices can be cached at once and only the active one
was being updated.

### Options Considered
1. **`setQueriesData` against all list slices** — the optimistic transform (remove id / edit chips)
   applies to every matching cached slice at once; `onSettled` invalidates them all.
2. **Update only the active slice + invalidate the rest** — the label view still shows the stale card
   until its refetch lands (the exact bug).

### Decision
Option 1. Snapshot and transform **every** `list`/`shared` slice in `onMutate`, restore all on error.

### Consequences
- Trash/archive/label edits reflect in the label view and My Notes simultaneously.
- The snapshot is an array of `[queryKey, data]` pairs, not a single value — rollback iterates.

## ADR-003: Add `sonner` for toasts; error on every failure, success only for meaningful/undoable actions

### Context
Issue #4: no event feedback. Mutations silently `catch {}`. No toast library installed.

### Decision
Add `sonner` (shadcn's standard toaster), mounted once app-wide and theme-linked. Route all toasts
through one `components/ui/sonner` seam. **Error toast on every mutation failure.** **Success toast
only** for meaningful/reversible actions (trash, archive — with **Undo**; label create/delete;
manual refresh). No toast on trivial always-succeeds interactions — avoid notification spam.

### Consequences
- Undo becomes a first-class affordance for the destructive-but-reversible actions (ADR-004).
- The refresh control gets real feedback (tooltip + spin + settle toast), fixing issue #3.

## ADR-004: Undo fires the inverse mutation, not a manual cache re-add

### Context
Trash and archive are reversible; users expect Undo. The inverse operations (restore, unarchive)
already exist as optimistic hooks.

### Decision
The success toast's **Undo** action calls the inverse hook's `mutate`. It does **not** hand-write the
row back into the cache.

### Consequences
- Single source of truth: Undo goes through the same optimistic + `onSettled` path as any action, so
  it can't resurrect a row the server actually rejected.
- Requires the forward hook to know its inverse (closure/injection) — kept internal to the hooks.

## ADR-005: Pinterest layout via CSS `columns`, not a JS masonry library

### Context
Issue #6: cards are uniform-height CSS-grid rows; the user wants a Pinterest masonry.

### Options Considered
1. **CSS `columns-*` + `break-inside-avoid`** — zero dependency, native, responsive, cards keep
   natural height. Fills column-by-column (not strict row order).
2. **JS masonry lib** (e.g. a react-masonry) — preserves strict DOM order, but adds a dependency,
   measures/repositions on resize, and risks layout thrash.

### Decision
Option 1 (CSS columns). Note cards don't need strict left-to-right ordering; the column-fill tradeoff
is acceptable for the authentic Pinterest look at no runtime cost.

### Consequences
- Within-row order follows column fill, not `updatedAt` strictly — noted as a tradeoff.
- If ordering complaints surface, graduate to a JS masonry lib (future-work).

## ADR-006: Instant note creation — optimistic open + editable-first for the creator

### Context
Issue #5 (the priority): New note blocks on POST → GET (`useNote`) → socket `identity` before the
editor is typable. Three sequential round-trips.

### Options Considered
1. **Optimistic open + editable-first** — open the editor shell on click without awaiting POST; seed
   the caches from the create response (no GET); make the editor editable immediately for the creator
   (owner ⇒ `edit`) instead of gating on the socket `identity`; attach the provider when the id
   resolves. Downgrade to read-only if the socket later says otherwise.
2. **Pre-created draft pool** — background-create a note so New note navigates to a warm id. Leaves
   orphan drafts, adds lifecycle/cleanup complexity.
3. **Parallelize but keep gating** — open before POST + seed cache, but still wait on the socket
   `identity` to become editable. Removes 2 of 3 round-trips; still a "Connecting…" gap before typing.

### Decision
Option 1. It is the only one that is truly instant, and it is safe because the socket enforces
authorization on **two** server-side gates: `none` **rejects the connection** (`authorizeConnection`
throws, `auth.ts:53`), and `view` sets `connection.readOnly = true` so Hocuspocus drops the
connection's inbound doc updates (`index.ts:73`). Client `editable` is UX-only (spec 04 ADR-003).
Optimistic editability can never bypass either gate; the worst case is a brief typable window that
fails to sync and downgrades with a toast.

### Consequences
- `Editor` gains an `assumeEditable` signal and an explicit socket-driven downgrade path with **two
  triggers**: (a) an `identity` message resolving `permission !== "edit"`, and (b) an
  auth-failure/`denied` status — because the `none` case throws in `onAuthenticate` and **never sends
  an `identity` message**, so keying the downgrade only off the permission message would leave the
  optimistic surface editable-looking. Both triggers force `setEditable(false)` + a read-only notice.
- Cache seeding synthesizes `createdAt`/`preview`/`isOwner` for the fresh note; `onSettled`/refetch is
  the reconcile.
- Rejected create rolls the seed out of the caches, closes the editor, and toasts.

## ADR-007: `apps/web`-only scope — no API/DB/socket/contract changes

### Context
All six issues are perceived-performance / UX. The backend already returns the right data and enforces
the right rules.

### Decision
Constrain the whole spec to `apps/web`. No new routes, columns, socket messages, or Zod schemas. The
optimistic layer is purely a client cache concern; instant-open leans on existing socket authority.

### Consequences
- Small, reviewable, front-end-isolated PRs.
- If any slice appears to need a backend change, that's a signal to stop and re-scope — it doesn't
  belong here.
