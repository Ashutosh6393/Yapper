# 12 · Note Lifecycle & Labels — Decisions

## ADR-001: Lifecycle state as two nullable timestamps (not a status enum)

### Context
A note is active, archived, or trashed (mutually exclusive), and trash needs an age clock for the
24h purge.

### Options Considered
1. **Two nullable timestamps** (`archivedAt`, `trashedAt`) — state derived; `trashedAt` doubles as
   the purge clock. No new enum.
2. **`noteStatus` pgEnum** + a separate `trashedAt` — more explicit, but still needs the timestamp,
   so it's enum *plus* timestamp.

### Decision
Two nullable timestamps. Smaller diff, no enum, `trashedAt` is both the state marker and the cron
clock. Trash "wins" over archive when both are set; **restore clears both → active** (we don't
restore back to archived).

### Consequences
- Default list filter is `archived_at IS NULL AND trashed_at IS NULL`.
- Restore is "null both columns"; no archived-preservation logic.

## ADR-002: Labels as `label` + `note_label` tables, owner-scoped, owned-notes only

### Context
Labels are user-created, reusable, many-to-many, enumerable in a sidebar, and clickable to filter.

### Options Considered
1. **Relational** `label` (owned, unique `(ownerId,name)`, fixed-palette `color`) + `note_label`
   junction.
2. **`text[]` tags** on `note` — no ownership, can't enumerate/rename in one place, can't count
   cheaply.

### Decision
Relational two-table model. Labels belong to the creating user and attach **only to that user's own
notes** (join is implicitly single-owner). Shared notes show no chips and can't be labeled.

### Consequences
- Every label query is trivially owner-scoped; card chip rendering is not viewer-dependent.
- "Label a shared note with your own labels" is deferred (future-work).

## ADR-003: Fixed-palette label color (not free hex, not DB enum)

### Context
Chips need color to be legible; must stay on-brand and dark-mode safe.

### Decision
A small fixed palette (e.g. `slate|rose|amber|emerald|sky|violet`), picked at create time. Stored as
a `text` **palette key**, validated by `labelColorSchema` (Zod) at the API boundary — not a Postgres
enum, so the palette can change without a migration. Web maps the key → Tailwind classes. Color edit
after creation is deferred.

## ADR-004: Delete = soft trash; hard `DELETE` repurposed + guarded to trashed-only

### Context
The card's "Delete" hard-deleted (cascade). We want a 24h safety net.

### Decision
"Move to Trash" (`POST /:id/trash`) is the card action; it soft-deletes. `DELETE /api/notes/:id`
becomes **permanent delete**, reachable only from the Trash view, and **409s unless `trashed_at` is
set**. The cron is the only other hard-delete path.

### Consequences
- The only ways to lose data are trash→delete-forever (with a confirm dialog) or the 24h purge.
- Guarding `DELETE` prevents the UI or a stray call from nuking an active note.

## ADR-005: Trash hides note from collaborators via `resolvePerm`; archive has no collaborator impact

### Context
`GET /shared` and `resolvePerm` don't know about lifecycle state, so a trashed shared note would stay
visible/editable.

### Decision
- **Archive:** purely the owner's organization — no collaborator/socket impact; sharing intact.
- **Trash:** add `trashed_at IS NULL` to `/shared`; extend `PermissionNote`/`loadNote` with
  `trashedAt` and make `effectivePermission` return `none` for a **non-owner** trashed note (owner
  unaffected). Do **not** rotate the token or flip `access` — restore resumes sharing unchanged.
- **Not** in this spec: publishing a revoke event to disconnect *already-connected* collaborators
  (future-work). `resolvePerm` blocks the next read/reconnect; that's the accepted boundary.

### Consequences
- Trash reuses the pure permission derivation (one added line + one loader column).
- A mid-session collaborator can keep editing a just-trashed note until reconnect.

## ADR-006: Single active view in the URL

### Context
The sidebar reads as primary navigation but currently shows two stacked sections and is static.

### Decision
Exactly one active view at a time (default My Notes), selected via URL query params
(`?view=my|shared|archive|trash`, `?label=<id>`). Each sidebar entry = one filtered list.

### Consequences
- Back/forward, refresh-persistence, and shareable view links work.
- The old "My Notes + Shared stacked" home layout is replaced by one section per view.
- Search stays ephemeral local state, scoped to the active view, and clears on view switch.

## ADR-007: Parameterized list endpoint + `labels[]` without Drizzle relations

### Context
Four views need owned-active / archived / trashed / by-label lists, and cards need each note's labels.

### Decision
One `GET /api/notes?filter=&label=` handler (Zod-parsed query; default `active`) instead of separate
routes; `/shared` stays its own route. Embed `labels[]` by a **grouped second query** over
`note_label ⋈ label` for the page's ids (or `jsonb_agg`), **not** Drizzle `relations()`/`db.query` —
the schema defines no relations and the list uses `db.select`; introducing the relational API would
be a larger, out-of-style change.

### Consequences
- One route/contract/Query-key per filter; label embedding is one extra query per page (no N+1).
- Bare `GET /api/notes` default changes from "all" to active-only (a contract change; fixtures update
  in the same slice).

## ADR-008: In-process hourly purge cron wrapping a testable `purgeTrash()`

### Context
"Trash cleared within 24h via cron." Infra is Neon/Upstash with a long-running Bun `api`; no job
runner.

### Decision
An in-process `setInterval` (hourly) in `api` calls a pure `purgeTrash(db)` function
(`DELETE … WHERE trashed_at < now() - interval '24 hours'`). Tests exercise `purgeTrash` directly,
not the timer. Scheduler wired in `src/index.ts` (not `app.ts`).

### Consequences
- Zero new infra/secrets; runs in local dev immediately.
- Worst-case retention ~24–25h (cadence independent of the window) — acceptable.
- Multi-instance double-run is harmless (idempotent). Serverless/scale-to-zero would need the
  external-trigger design (future-work).

## ADR-009: Label management via the card ⋮ menu; delete in scope, rename deferred

### Context
Labels must be created and attached somewhere; management scope was unstated.

### Decision
Create + attach happen inline in the note card's ⋮ **Labels…** editor (checkboxes + inline create
with a color swatch); `PUT /api/notes/:id/labels` replaces the whole set. Deleting a label is in
scope (hover icon in the sidebar + confirm). **Renaming is deferred.** No separate labels-manager
screen.

### Consequences
- No dedicated management UI; the sidebar Labels section is list + filter + delete only, hidden until
  ≥1 label exists.
