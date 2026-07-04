# CLAUDE.md — 12 · Note Lifecycle & Labels

## Project Context

Add archive, soft-delete trash (24h in-process purge), and user labels to Yapper on top of the
redesigned dashboard. Sidebar tabs become a working single active view driven by the URL. Ships as
four dependency-ordered slices (12a DB → 12b API/cron → 12c web lifecycle → 12d web labels), each a
reviewable PR with a goal-state test first.

## Before Starting Work

1. Read `specs/12-note-lifecycle-and-labels/design.md` (goal state + per-slice detail).
2. Read `decisions.md` (ADR-001…009 — the *why*).
3. Check `implementation.md` for current progress and the next slice.
4. Look at existing patterns in:
   - `packages/db/src/schema.ts` (add columns/tables here; `db:generate` migration)
   - `apps/api/src/notes/router.ts` (`authed()` + `ownsNote()` mutation pattern to reuse)
   - `packages/permissions/src/derive.ts` + `loaders.ts` (add `trashedAt` to the rule/loader)
   - `apps/web/lib/queries/notes.ts` (Query hooks + `noteKeys`), `app/dashboard/page.tsx`
   - `apps/web/components/dashboard/{sidebar,note-card,note-section}.tsx`
   - `packages/schemas/src/note.ts` + `common.ts` (contract source of truth)

## Code Patterns

- **Contracts first:** add/extend Zod in `@yapper/schemas`; `z.infer` for types; never duplicate a
  shape per app; **no `as any`**.
- **Owner-gate mutations** server-side with the existing `authed()` + `ownsNote()` pattern; 404
  absent / 403 non-owner. `DELETE` also 409s unless `trashed_at` is set.
- **State ownership:** TanStack Query = lists/labels; `useState` = search + menu/dialog open; the
  **URL** = active view (`?view=`, `?label=`). Not Zustand for server data.
- **Labels in the list:** grouped second query over `note_label ⋈ label` (or `jsonb_agg`) — do
  **not** add Drizzle `relations()`/`db.query`.
- **Perm cache:** bust the note's perms on trash/restore (`bustNotePermissions`); **no** revoke
  publish (socket disconnect is future-work).
- **Cron:** pure `purgeTrash(db)` + a `setInterval` wired in `src/index.ts` (not `app.ts`); test the
  function, not the timer.
- **Theme:** semantic tokens only; no `globals.css` token-value changes. Icons: `lucide-react`.
- **TDD:** failing goal-state test first per slice; green + `tsc --noEmit` + Biome before done.
- **Run tests from the app/package dir** (Bun loads `.env` from cwd; repo-root DB tests fail on
  `DATABASE_URL`).

## Don't

- Don't add features not in `design.md`: no socket **disconnect on trash**, no label **rename**, no
  labeling shared notes, no "leave shared note", no external cron, no bulk/empty-trash actions.
- Don't hard-delete an active note — trash is the only path to `DELETE` (guarded).
- Don't let archived/trashed notes leak into My Notes (default filter = active).
- Don't render label chips on shared or trash-view cards; cap at 3 + `+N`.
- Don't select `credential.key` or the CRDT blob. Don't skip tests. Don't hand-edit generated
  migrations or `/notes/[id]` beyond what a slice needs.
