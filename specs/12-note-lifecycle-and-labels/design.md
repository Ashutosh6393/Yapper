# 12 · Note Lifecycle & Labels — Design

Add three organizational capabilities to Yapper, on top of the redesigned dashboard (spec 11):

1. **Archive** — an owner can archive/unarchive an owned note (private organization; no effect on
   sharing or collaborators).
2. **Trash (soft delete)** — "delete" no longer hard-deletes. It moves a note to Trash, where the
   owner can **Restore** it or **Delete forever**. Trashed notes are purged **within ~24h** by an
   in-process cron.
3. **Labels** — user-created, colored labels (many-to-many with owned notes). Labels show as chips
   on note cards, live in a **Labels** section in the sidebar, and clicking one filters the
   dashboard to that label's notes.

The sidebar tabs (My Notes / Shared with Me / Archive / Trash), currently static, become a working
**single active view** selector driven by the URL.

This spec ships as **one feature, four dependency-ordered slices** (12a–12d). Each slice is its own
reviewable PR with a goal-state test written first (TDD).

## Goal State (acceptance)

**Lifecycle**
1. An owned note has two nullable timestamps — `archivedAt`, `trashedAt`. State is derived:
   `trashedAt` set → **trash**; else `archivedAt` set → **archive**; else **active**. Restore clears
   both (returns to active).
2. The note card ⋮ menu (owned, non-trashed) offers **Labels… / Archive (or Unarchive) / Move to
   Trash**. Shared cards have **no** ⋮ menu. Trash cards offer **Restore / Delete forever** only.
3. **Move to Trash** and **Archive/Unarchive** are reversible and need no confirm. **Delete forever**
   is irreversible and shows a confirm dialog; it is the only path to a hard delete (plus the cron).
4. Archived notes open & edit normally; **trashed notes are not openable**.
5. Archiving/trashing a **shared** note: archive has **no** collaborator impact. Trash removes the
   note from collaborators' "Shared with me" and makes `resolvePerm` return `none` for non-owners
   (blocks new reads/reconnects). Restore brings sharing back unchanged (token not rotated).
6. A trashed note older than 24h is permanently deleted by the in-process hourly purge.

**Views**
7. The sidebar tabs are functional: exactly one active view at a time, default **My Notes**. Views:
   My Notes (owned active), Shared with Me, Archive (owned archived), Trash (owned trashed),
   Label "X" (owned active notes with label X). The active view lives in the URL
   (`?view=my|shared|archive|trash`, `?label=<id>`).
8. Client-side search is scoped to the active view and clears when the view switches.

**Labels**
9. Labels are owner-scoped and attach **only to owned notes**. A note can have many labels.
10. The card ⋮ **Labels…** editor lists the user's labels as checkboxes and supports **inline
    create** (name + a color swatch from a fixed palette); `PUT` replaces the note's whole set.
11. Note cards render up to **3** label chips (color dot + name) **before the timestamp**, then
    `+N`. Trash-view cards render no chips.
12. The sidebar shows a **Labels** section (hidden until ≥1 label): each label as color dot + name +
    **note-count**. Click → `?label=<id>` view; a hover **delete** icon removes the label (confirm;
    notes keep existing, they just lose the label). Deleting the active label resets the view to My
    Notes.
13. Label note-counts and the label filter view include **active owned notes only**. Labels persist
    through archive/trash and reappear on restore.

## Scope

**In:** DB migration (note timestamps + `label` + `note_label`); parameterized list endpoint +
lifecycle/label routes + purge cron; `resolvePerm` trash handling; dashboard URL view model + working
sidebar tabs + per-view card actions; label chips, sidebar Labels section, card label editor.

**Out (see future-work.md):** live socket **disconnect on trash** (mid-session collaborators stay
connected until reconnect); label **rename**; labeling **shared** notes with your own labels;
"leave a shared note"; external/serverless cron trigger; hard-24h purge precision; label color
edit after creation; bulk actions; trash "empty all" button.

---

## Slice 12a — DB schema

`packages/db/src/schema.ts` (+ generated migration, + `schema.test.ts`):

```ts
// note: two nullable lifecycle timestamps
archivedAt: timestamp("archived_at", { withTimezone: true }),
trashedAt:  timestamp("trashed_at",  { withTimezone: true }),
// index to keep default (active) list + purge scan cheap
index("note_trashed_at_idx").on(table.trashedAt),

// label — owner-scoped, fixed-palette color, unique name per owner
export const label = pgTable("label", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  color: text("color").notNull().default("slate"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
}, (t) => [
  unique("label_owner_name_unq").on(t.ownerId, t.name),
  index("label_owner_id_idx").on(t.ownerId),
]);

// note_label — junction, both FKs cascade
export const noteLabel = pgTable("note_label", {
  noteId:  uuid("note_id").notNull().references(() => note.id,  { onDelete: "cascade" }),
  labelId: uuid("label_id").notNull().references(() => label.id, { onDelete: "cascade" }),
}, (t) => [
  primaryKey({ columns: [t.noteId, t.labelId] }),
  index("note_label_label_id_idx").on(t.labelId),  // filter/count by label
]);
```
- Add inferred `Label` / `NewLabel` / `NoteLabel` types.
- `color` is a plain `text` holding a **palette key** (not free hex) — validated by Zod at the API
  boundary, not by a DB enum (keeps the palette editable without a migration).
- Run `bun run db:generate` from `packages/db` to emit the migration; do **not** hand-edit generated
  SQL. Apply with `db:migrate`/`db:push`.

**Test (12a, first):** `schema.test.ts` asserts the new columns/tables exist and the FKs/unique
constraint are present (extend the existing schema tests).

---

## Slice 12b — API + schemas + cron

### `@yapper/schemas` (`packages/schemas/src`)
- `common.ts`: add `labelColorSchema` = `z.enum([...palette])` (fixed palette, e.g.
  `slate | rose | amber | emerald | sky | violet`), exported for reuse.
- `note.ts`:
  - `labelChipSchema = z.object({ id, name, color: labelColorSchema })`; `LabelChip` type.
  - `noteSummarySchema` += `labels: z.array(labelChipSchema)` (owned summaries only).
  - `noteListQuerySchema = z.object({ filter: z.enum(["active","archived","trashed"]).default("active"), label: z.string().optional() })` for `GET /api/notes` query parsing.
- New `label.ts`: `labelSchema` (`id,name,color,noteCount`), `createLabelBodySchema`
  (`{ name: z.string().min(1).max(50), color: labelColorSchema }`),
  `setNoteLabelsBodySchema` (`{ labelIds: z.array(z.string()) }`). Barrel-export from `index.ts`.
- Update `note.test.ts` + add `label.test.ts`.

### `apps/api` (`src/notes/router.ts`, new `src/labels/router.ts`, `src/cron.ts`)
```
GET    /api/notes?filter=active|archived|trashed&label=<id>   # default active; owned; embeds labels[]
POST   /api/notes/:id/archive        # owner; set archived_at = now()
POST   /api/notes/:id/unarchive      # owner; set archived_at = null
POST   /api/notes/:id/trash          # owner; set trashed_at = now()  (replaces old delete-as-remove)
POST   /api/notes/:id/restore        # owner; set trashed_at = null, archived_at = null
DELETE /api/notes/:id                # owner; PERMANENT; 409 unless trashed_at is set
GET    /api/notes/shared             # + WHERE trashed_at IS NULL
GET    /api/labels                   # owner's labels + note-count (active notes only)
POST   /api/labels                   # create { name, color } -> label; 409 on duplicate name
DELETE /api/labels/:id               # owner; cascade removes note_label rows
PUT    /api/notes/:id/labels         # owner; replace note's label set to { labelIds }
```
- **List handler:** parse the query with `noteListQuerySchema`. Base `WHERE owner_id = :me`.
  `active` → `archived_at IS NULL AND trashed_at IS NULL`; `archived` → `archived_at IS NOT NULL AND
  trashed_at IS NULL`; `trashed` → `trashed_at IS NOT NULL`. `label` implies `active` and adds a
  join/`EXISTS` on `note_label`. **The bare default changes from "all" to active-only.**
- **Embedding `labels[]`:** do **not** introduce Drizzle `relations()`/`db.query` (schema has none
  today and the list uses `db.select`). After the metadata `select`, run one grouped query over
  `note_label ⋈ label` for the page's note ids (`WHERE note_label.note_id IN (...)`) and stitch in
  JS; or a `jsonb_agg` correlated subquery. Trash view returns `labels: []`.
- **Ownership:** archive/unarchive/trash/restore/permanent-delete/label routes reuse the existing
  `ownsNote` + `authed()` pattern; 404 absent, 403 non-owner. `DELETE` additionally 409s when
  `trashed_at IS NULL`.
- **Perm cache:** trash busts the note's cached permissions (`bustNotePermissions`). **No** revoke
  publish (socket disconnect is future work). Restore also busts (perm becomes available again).
- **Labels router** mounted at `/api/labels`, behind `requireAuth`; every query scoped by
  `owner_id = req.userId`. `POST` maps a Zod `ZodError`/duplicate to `409`. `GET` note-count is a
  `LEFT JOIN note_label ⋈ note` counting only active notes (`archived_at IS NULL AND trashed_at IS
  NULL`), `GROUP BY label.id`.
- **Cron (`src/cron.ts`):** export `purgeTrash(database): Promise<number>` running
  `DELETE FROM note WHERE trashed_at < now() - interval '24 hours'` (cascades to note_doc /
  note_collaborator / note_label), returning the row count. `startTrashPurgeScheduler()` calls it on
  a `setInterval` (hourly); wired in `src/index.ts` (not `app.ts`, so tests don't start a timer).

### `packages/permissions`
- `derive.ts`: `PermissionNote` += `trashedAt: Date | null`; `effectivePermission` returns `none`
  for a **non-owner** when `trashedAt != null` (owner still `edit`). Add a derive test.
- `loaders.ts`: `loadNote` selects `trashedAt` too.

**Tests (12b, first):** schema tests (above); api route tests (supertest) for each new route incl.
default-active filtering, `?filter=`/`?label=`, 409-on-non-trashed delete, `/shared` excludes
trashed, labels CRUD + `PUT` replace, note-count; a `purgeTrash` unit test (insert an old-trashed +
a recent-trashed note, assert only the old one is deleted); the permissions derive test.

---

## Slice 12c — Web: lifecycle & working sidebar

`apps/web`:
- **View model:** dashboard reads the active view from the URL (`useSearchParams`): `view` +
  `label`. A small helper derives `{ view, labelId }`; the sidebar sets it via `router.push`/`replace`
  with an updated query string. Default (no params) = My Notes.
- **`lib/queries/notes.ts`:** `useNotes(filter)` keyed by filter (`noteKeys.list(filter, labelId)`);
  add `useArchiveNote`, `useUnarchiveNote`, `useTrashNote`, `useRestoreNote`, `usePermanentDelete`
  mutations, each invalidating `noteKeys.all`. Replace the old `useDeleteNote` card wiring with
  `useTrashNote` (My Notes/Archive) and `usePermanentDelete` (Trash).
- **`components/dashboard/sidebar.tsx`:** tabs become links reflecting the active view (`aria-current`
  from the URL, not a hardcoded `active`). My Notes / Shared / Archive / Trash.
- **`components/dashboard/note-card.tsx`:** ⋮ menu content depends on a `variant` prop
  (`my | archive | trash | shared`): `my`→ Labels…/Archive/Move to Trash; `archive`→
  Labels…/Unarchive/Move to Trash; `trash`→ Restore/Delete forever; `shared`→ no menu. Trash cards
  are non-openable (no body button). Delete forever opens a confirm dialog (shadcn `AlertDialog` or
  reuse `Dialog`).
- **`app/dashboard/page.tsx`:** render a **single** section for the active view (not the current two
  stacked sections). Section data = the view's query. Search stays local `useState`, filters the
  active view's list, and resets on view change (effect keyed by view/label).

**Tests (12c, first):** dashboard test — selecting a sidebar tab changes the rendered view/query;
card ⋮ actions call the right mutation per variant; trash card shows Restore/Delete-forever and
Delete-forever confirms; shared card has no menu; search clears on view switch.

---

## Slice 12d — Web: labels UI

`apps/web`:
- **`lib/queries/labels.ts`:** `useLabels()` (sidebar list w/ counts), `useCreateLabel`,
  `useDeleteLabel`, `useSetNoteLabels` — parse responses with `@yapper/schemas`; invalidate
  `labelKeys.all` and `noteKeys.all`.
- **Sidebar Labels section** (`sidebar.tsx` or a new `label-nav.tsx`): hidden until ≥1 label; each
  row = color dot + name + count, click → `?label=<id>`; hover delete icon → confirm → `useDeleteLabel`
  (if it was the active label, navigate to My Notes).
- **Card chips** (`note-card.tsx`): render `note.labels` (color dot + name) **before** the timestamp,
  max 3 then `+N`. Not rendered for the `trash`/`shared` variants.
- **Label editor** (in the card ⋮ **Labels…**): a popover/submenu listing `useLabels()` as
  checkboxes (checked = attached), plus an inline "create" row (text input + palette swatches) that
  calls `useCreateLabel` then includes it in the set. Saving calls `useSetNoteLabels(noteId, ids)`
  (`PUT` replace).
- **Palette:** a shared `labelColor` → Tailwind class map (dot bg + chip text/border) using semantic
  tokens where possible; dark-mode safe. Colocate with the chip component.

**Tests (12d, first):** card renders chips (≤3 + `+N`); Labels… editor toggles + inline-create calls
the mutations; sidebar Labels section hidden with 0 labels, lists labels + counts with ≥1, click sets
the label view, delete calls the mutation.

---

## Cross-cutting rules (all slices)
- **Contracts first:** add/extend Zod schemas in `@yapper/schemas`; derive types with `z.infer`; no
  duplicated shapes; **no `as any`**.
- **Server vs client state:** TanStack Query owns all lists/labels; `useState` owns search text +
  dialog/menu open state; the **URL** owns the active view. Don't put server data in Zustand.
- **Never** select `credential.key` or the CRDT blob. Owner-gate every lifecycle/label mutation
  server-side (don't trust the client).
- **Theme:** semantic tokens only; no `globals.css` token-value changes.
- **TDD:** write the failing goal-state test first for each slice; mark a slice done only when green
  (`bun test` in the touched package/app), `tsc --noEmit` clean, Biome clean.

## Risks / notes
- **Default-list behavior change:** flipping bare `GET /api/notes` from "all" to active-only is a
  contract change — the existing dashboard/query fixtures must be updated in the same slice, and any
  caller relying on "all" must move to `?filter=`.
- **Trash without socket kick:** a collaborator already connected when the owner trashes a note keeps
  editing until they reconnect (no revoke publish this spec). Called out in goal state #5 and
  future-work; acceptable because `resolvePerm` blocks the next read/reconnect.
- **Label-count query** must count active notes only and stay indexed (`note_label_label_id_idx`,
  `note_owner_id_idx`); avoid N+1 when stitching `labels[]` into the list (one grouped query per
  page, not per note).
- **Multi-instance cron** double-runs the purge harmlessly (idempotent delete). If `api` ever goes
  serverless/scale-to-zero the in-process timer won't fire — graduate to the external-trigger design
  in future-work.
- **Migration ordering:** 12a must land before 12b (routes reference the new columns/tables).
