# 12 · Note Lifecycle & Labels — Implementation

## Status: in-progress (12a, 12b done)

## Completed
- **12a — DB schema.** Added `archivedAt`/`trashedAt` nullable timestamps + `note_trashed_at_idx`
  to `note`; new `label` (owner-scoped, unique `(ownerId,name)`, palette-key `color` default
  `slate`) and `note_label` (composite PK, both FKs cascade, `note_label_label_id_idx`) tables;
  inferred `Label`/`NewLabel`/`NoteLabel`/`NewNoteLabel` types. Migration `0002_useful_ogun.sql`
  generated + applied. `schema.test.ts` extended first (lifecycle defaults, label create/attach/
  unique/cascade) — 3/3 pass, `tsc` + Biome clean.
- **12b — API + schemas + cron.**
  - `@yapper/schemas`: `labelColorSchema` (palette enum), `labelChipSchema`, `noteSummarySchema`
    += `labels` (default `[]`), `noteListQuerySchema`; new `label.ts` (`labelSchema`,
    `createLabelBodySchema`, `setNoteLabelsBodySchema`). Tests updated/added — 34 pass.
  - `@yapper/permissions`: `PermissionNote` += `trashedAt`; `effectivePermission` → `none` for a
    non-owner trashed note (owner still edit); `loadNote` selects `trashedAt`. 12 pass.
  - `apps/api`: parameterized `GET /api/notes?filter=&label=` (default **active-only**, embeds
    `labels[]` via one grouped query, trash → `[]`); lifecycle routes archive/unarchive/trash/
    restore (owner-gated, trash/restore bust perms, no revoke publish); guarded `DELETE` (409
    unless trashed); `/shared` excludes trashed; new `labels/router.ts` (GET w/ active-only counts,
    POST w/ 409 dup, DELETE) mounted at `/api/labels`; `PUT /api/notes/:id/labels` replace (filters
    to owner's labels); `cron.ts` `purgeTrash()` + hourly `startTrashPurgeScheduler` wired in
    `index.ts`; shared `authed.ts` extracted. 30 pass (`bun test --timeout 30000` — Neon latency).
  - Gotcha: drizzle `exists()` subquery cannot project the outer table's column — select `sql\`1\``.

## Next: 12c (web lifecycle) will also fix web `tsc` — the `noteSummary.labels` contract change
ripples into web fixtures, repaired in that slice.

## In Progress

## Blocked

## Next Steps
Execute slice-by-slice (each = its own PR, goal-state test first per TDD):

1. **12a — DB schema.** Add `archivedAt`/`trashedAt` to `note`; `label` + `note_label` tables;
   inferred types; `bun run db:generate` migration. Extend `schema.test.ts` first. Run tests from
   `packages/db` (`.env` DATABASE_URL).
2. **12b — API + schemas + cron.** `@yapper/schemas` (label color/chip, list-query, label bodies) →
   parameterized `GET /api/notes` (+ default active) → lifecycle routes → guarded `DELETE` →
   `/shared` trash filter → labels router → `resolvePerm` trash handling → `purgeTrash()` + hourly
   scheduler. Tests first. Run api tests from `apps/api`.
3. **12c — Web lifecycle.** URL view model + working sidebar tabs + per-variant card menus +
   Restore/Delete-forever(confirm) + view-scoped search. Query hooks for the new mutations. Web test
   first.
4. **12d — Web labels.** Label query hooks, sidebar Labels section (hidden until ≥1), card chips
   (≤3 + `+N`), card ⋮ Labels… editor with inline create + palette. Web test first.

## Session Notes

### 2026-07-04
- Spec written after a `/grill-with-docs` design interview (design.md, decisions.md, CLAUDE.md,
  future-work.md). Branch: `feat/note-lifecycle-labels`.
- Design digest locked across 17 questions. Key ADRs: two nullable timestamps (001); relational
  owner-scoped labels, owned notes only (002); fixed-palette color (003); soft-trash + guarded hard
  DELETE (004); trash hides via `resolvePerm`, archive no impact, socket-kick deferred (005); single
  URL-driven view (006); parameterized list + `labels[]` without Drizzle relations (007); in-process
  hourly `purgeTrash` (008); label mgmt via card menu, rename deferred (009).
- Context7 (Drizzle) confirmed nested `with` needs `relations()` the schema lacks → embed `labels[]`
  via a grouped second query, matching the existing `db.select` style.
- Not yet started: implementation.
