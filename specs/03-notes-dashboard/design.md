# 03 · Notes & Dashboard — Design

## Goal State (acceptance)
1. A logged-in user can **create** a note (button on dashboard) → a `note` row with `owner_id = me`,
   `access='private'`, `title='Untitled'`.
2. The dashboard lists the user's owned notes ("My Notes") with title + preview + updated time;
   empty state when none.
3. Clicking a note opens `/notes/:id` (an authenticated placeholder page — the editor lands in slice 04).
4. The user can **delete** their own note (cascades `note_doc`, `note_collaborator`).
5. All notes REST is gated: unauthenticated → 401; a user cannot read/delete another user's note (403/404).

> This slice is metadata + CRUD only. No Yjs/editor yet; the note page is a shell. "Shared with me"
> arrives in slice 06 (needs collaborators). Editing content arrives in slice 04.

## Scope
**In:** `api` notes REST (create, list-owned, get-one, delete) with auth middleware; `web` dashboard
(My Notes list, create, empty state) + `/notes/:id` shell; ownership authorization.
**Out:** content editing (04), sharing/permissions (06), "Shared with me" (06).

## API (Express, under `/api`, all require session)
```
POST   /api/notes            -> create owned note          201 { id, title, access, updatedAt }
GET    /api/notes            -> list my owned notes        200 [{ id, title, preview, updatedAt }]
GET    /api/notes/:id        -> get one (owner only here)  200 { ...metadata }   403/404 otherwise
DELETE /api/notes/:id        -> delete (owner only)        204                   403/404 otherwise
```
- Auth: a middleware resolves the Better Auth session → `req.userId` (401 if none).
- Authorization this slice: `owner_id === req.userId`. (General permission check arrives in 06.)
- List query selects only `id,title,preview,updated_at` from `note` — never `note_doc.state`.

## Web
- `app/dashboard/page.tsx` — fetch My Notes (server component or client w/ credentials), render list +
  "New note" button (POST → redirect to `/notes/:id`), empty state.
- `app/notes/[id]/page.tsx` — gated shell: fetch metadata, show title + "editor coming soon" placeholder,
  delete button. (Slice 04 replaces the placeholder with the editor.)
- A small typed fetch wrapper that sends credentials to `api`.

## Implementation tasks
1. `requireAuth` middleware in `api` (session → `req.userId`) → verify 401 without session.
2. `POST /api/notes` + `GET /api/notes` → verify create then list returns it.
3. `GET /api/notes/:id` + `DELETE` with ownership guard → verify 403/404 for non-owner.
4. web dashboard list + create + empty state → verify create redirects to note shell.
5. web `/notes/:id` shell + delete → verify delete returns to dashboard, row gone (cascade).

## Test plan
- API tests (supertest-style): unauth→401; create→list; get/delete non-owner→403/404; delete cascades.
- Manual: create a couple notes, see them listed, open, delete.

## Risks / notes
- Keep authorization logic minimal and local now; it gets generalized into `@yapper/permissions` in 06 —
  structure the owner check so it's easy to swap for the shared derivation.
- Ensure list endpoint stays cheap (no blob, indexed by `owner_id`).
