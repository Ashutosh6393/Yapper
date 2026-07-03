# 11 · Dashboard Redesign — Design

Rebuild `apps/web/app/dashboard` to match the imported **Yapper Dashboard** design: a fixed
sidebar + top bar shell, minimal note cards in two sections (My Notes / Shared with Me), a live
search filter, and a **note dialog** that opens notes (new and existing) with the reused editor
and sharing controls. Dark-theme palette is already present in `globals.css` (from the landing
page import) — this slice consumes those tokens, it does not re-theme.

## Goal State (acceptance)
1. `/dashboard` renders the new shell: fixed **sidebar** (logo, nav, New Note) + **top bar**
   (search, refresh, avatar menu) + scrollable content with **My Notes** and **Shared with Me**
   sections. Logged-out visitors still redirect to `/login`.
2. **My Notes** and **Shared with Me** render minimal cards from real query data
   (`useNotes` / `useSharedNotes`), with loading skeletons and empty states.
3. A minimal **note card** shows: title · access badge · preview · last-edited timestamp
   (bottom) · **⋮ menu** (top-right) with **Delete**. Owned cards badge **Private** (`access:
   private`) vs **Public** (`view`/`edit`). Shared cards add a top line **"{owner}'s note"** and
   badge **View only** (`view`) vs **Edit** (`edit`). (`access: none` does not exist; revoked notes
   drop off the shared list — see Risks.)
4. The **search** box filters both sections client-side by title + preview (case-insensitive).
5. The **top-bar refresh** button refetches the notes queries; the **avatar** button opens a
   dropdown showing the user's email, a **theme toggle**, and **Sign out**.
6. **New Note** (sidebar) and **Start a new note…** (top bar) create a note via `useCreateNote`
   and open the **note dialog** on the new id. Clicking any note **card** opens the note dialog
   on that note's id.
7. The **note dialog** shows the note's **content** (reused `Editor`) and, for the owner,
   **settings** at the top: access level private → view → edit + share link copy + make-private
   (reused `ShareDialog`, wired to `useShareNote` / `useMakePrivate`).
8. Owner note access is real: `GET /api/notes` returns `access` (new field); the Public/Private
   badge derives from it. Shared owner names are real: `GET /api/notes/shared` returns `ownerName`
   (new field; the endpoint already returns `access`).

## Scope
**In:**
- **api / schemas / db:** add `access` to owned note summaries and `ownerName` to shared note
  summaries (query + Zod schema + tests).
- **web dashboard:** new layout shell, sidebar, top bar (search / refresh / avatar dropdown),
  minimal note cards + ⋮ delete menu, two sections, live search, note dialog (reusing `Editor`
  + `ShareDialog`) for new + existing notes.
- **shadcn:** add `dialog` and `dropdown-menu` primitives.

**Out (see future-work.md):** the rich editor itself (reused as-is — no new editing features),
live presence / avatar stacks / "N editing" badges, Archive & Trash (nav shown, non-functional),
the floating dock (dropped), server-side search, react-icons (using lucide-react).

## Backend changes
```
GET /api/notes         -> [{ id, title, preview, updatedAt, access }]        # +access
GET /api/notes/shared  -> [{ id, title, preview, updatedAt, access, ownerName }]   # +ownerName
```
- `@yapper/schemas` (`packages/schemas/src/note.ts`):
  - `noteSummarySchema` += `access: noteAccessSchema`.
  - `sharedNoteSummarySchema` += `ownerName: z.string()` (it already extends with `access`).
  - Update `note.test.ts` to cover the new fields.
- `apps/api` (`apps/api/src/notes/router.ts`): owned-list query already selects the note row →
  add `access` to the projection. Shared-list query already returns `access`; add a join on the
  owner (`user.name`) → return as `ownerName`. Never select `credential.key` or the CRDT blob.
- `noteAccessSchema` = `private | view | edit` (no `none`). The shared-list endpoint filters
  `ne(note.access, "private")`, so shared cards are only ever `view`/`edit`.
- `packages/db`: no schema migration expected (`note.access` and `user.name` already exist);
  confirm and note in decisions if a column is missing.

## Web
File layout (small, focused modules):
```
apps/web/app/dashboard/page.tsx        # session gate, layout shell, data wiring, search + dialog state
apps/web/components/dashboard/
  sidebar.tsx        # logo, nav (My Notes active; Shared/Archive/Trash), New Note button
  top-bar.tsx        # controlled search, refresh, avatar dropdown (email / theme / sign out)
  note-section.tsx   # section header (label · rule · count) + grid + loading/empty states
  note-card.tsx      # minimal card + Public/Private badge + shared owner line + ⋮ delete menu
  note-dialog.tsx    # shadcn Dialog wrapping reused <Editor> + <ShareDialog>
apps/web/components/ui/dialog.tsx          # add shadcn Dialog
apps/web/components/ui/dropdown-menu.tsx   # add shadcn DropdownMenu
```
- **Theme:** consume existing tokens (`bg-background`, `bg-card`, `text-primary`, `border-border`,
  `text-muted-foreground`). No changes to `globals.css` token values.
- **Icons:** `lucide-react` (already a dependency).
- **Refresh:** `queryClient.invalidateQueries({ queryKey: noteKeys.all })`.
- **Search:** local `useState`; filter `useNotes`/`useSharedNotes` data before rendering.
- **Note dialog:** controlled by dashboard state `{ open, noteId }`. New Note → `useCreateNote`
  → set `noteId` to the returned id → open. Reuses `Editor` (content) and `ShareDialog` (owner
  settings). Needs the note's `isOwner`/`access` via `useNote(noteId)` inside the dialog.
- **`/notes/[id]` route stays** unchanged (share/deep links still resolve there).

## Implementation tasks
1. **Schema:** extend `noteSummarySchema` (+`access`) and `sharedNoteSummarySchema` (+`ownerName`);
   update `packages/schemas/src/note.test.ts` → red → green.
2. **API:** owned-list returns `access`; shared-list joins owner name → `ownerName`. Verify with
   existing api test patterns (unauth 401 unaffected; response shape matches new schema).
3. **shadcn:** add `dialog` + `dropdown-menu` to `components/ui`.
4. **Dashboard shell + sidebar + top bar** using existing tokens; wire refresh + avatar dropdown
   (email / theme toggle / sign out).
5. **Note sections + minimal cards** (Public/Private badge from `access`, shared owner line,
   revoked greyed state) + ⋮ delete menu (`useDeleteNote`).
6. **Live search** across both sections.
7. **Note dialog** wrapping reused `Editor` + `ShareDialog`; wire New Note / Start-a-note / card
   click.
8. Dashboard component test (Vitest) for the goal state (see Test plan).

## Test plan
- **Schemas (`packages/schemas`):** `note.test.ts` parses the new `access` / `ownerName` fields and
  rejects when missing.
- **API (`apps/api`):** `/api/notes` includes `access`; `/api/notes/shared` includes `ownerName`;
  auth gating unchanged.
- **Web (`apps/web`, Vitest + RTL, mocked queries):**
  - renders My Notes + Shared sections from mocked data;
  - search filters cards by title/preview;
  - owned card shows Public vs Private from `access`;
  - shared card shows the owner line + View/Edit badge from `access`;
  - ⋮ menu → Delete calls the delete mutation;
  - New Note opens the dialog.
- **Manual:** create → dialog opens with editor; share (view/edit) + copy link; make private;
  delete from card; search; refresh; sign out from avatar menu.

## Risks / notes
- **Reused `Editor` in a dialog** opens a Hocuspocus WebSocket per open; ensure the dialog fully
  unmounts `Editor` on close so the provider is destroyed (it cleans up on unmount today). Key the
  dialog body by `noteId`.
- **`ownerName` join** must not leak `credential.key` or the CRDT blob — select only `user.name`.
- **Revoked shared card is not reachable:** the shared-list query excludes `access: private`, so a
  note made private disappears from the list rather than showing a greyed "Access revoked" card.
  The mockup's revoked card is decorative — deferred to future-work (would need the endpoint to
  also surface recently-revoked collaborations).
- Keep the owned-list query cheap and indexed by `owner_id`; `access` is already on the row.
- The design is dark-only; because tokens are semantic, the dashboard also renders in light mode
  via the existing theme toggle — acceptable, not a regression.
