# 06 · Sharing & Permissions — Design

## Goal State (acceptance)
1. An owner can **enable sharing** on a note and pick the level: **view** or **edit** → a capability link
   `/<app>/share/:token` is generated (unguessable token; `note.access` set; `share_token` set).
2. A second user opens the link → must **log in** → on first open becomes a tracked
   `note_collaborator` (status `active`) → redirected into the note.
3. The collaborator can **edit** if `access='edit'`, or is **view-only** if `access='view'`.
4. **View-only is enforced server-side**: a viewer's inbound Yjs updates are rejected by the `socket`
   (Hocuspocus read-only connection); the client editor is also non-editable for UX.
5. The note appears in the collaborator's **"Shared with me"** dashboard section.
6. The exact same permission rule governs both `api` (REST) and `socket` (`onAuthenticate`), via
   `@yapper/permissions`, with a Redis cache for fast connect-time checks.

## Scope
**In:** `@yapper/permissions` (derivation `none|view|edit` + Redis cache helpers); `api` sharing endpoints
+ join flow; web share UI + `/share/:token` join page + "Shared with me"; `socket` `onAuthenticate` switched
to the shared derivation + read-only connections for viewers.
**Out:** make-private/revoke + token rotation + live disconnect (slice 07).

## Permission derivation (`@yapper/permissions`)
```
effectivePermission(userId, note, isActiveCollaborator):
  if note.owner_id === userId            -> 'edit'      // owner always
  if note.access === 'private'           -> 'none'
  if !isActiveCollaborator               -> 'none'      // must have joined via link
  if note.access === 'edit'              -> 'edit'
  if note.access === 'view'              -> 'view'
```
- Cache key `perm:{noteId}:{userId}` in Redis (short TTL); busted on access/collaborator changes.
- Used by `api` route guards and `socket.onAuthenticate` → identical results, no drift.

## API (Express, session required)
```
POST   /api/notes/:id/share        { level: 'view'|'edit' }  (owner) -> { token, url, access }   // enable/update
GET    /api/share/:token           -> note summary (for the join page; requires session)
POST   /api/share/:token/join      (session) -> upsert active collaborator -> { noteId }
GET    /api/notes/shared           -> my "Shared with me" (active collaborator rows joined to note)
```
- `POST share`: owner-only; sets `access` + mints `share_token` if absent; busts perm cache.
- `join`: validates token → finds note → upserts `note_collaborator(note_id,user_id,status='active')`,
  bumps `last_access`; busts that user's perm cache.

## socket changes
- `onAuthenticate`: `verifyJwt` → `userId`; load note + active-collaborator flag (cache-first); compute
  `effectivePermission`. `none` → reject; `view` → mark connection **readOnly** (server drops inbound doc
  updates, still streams out + awareness/presence); `edit`/owner → read/write.
- Client: TipTap `editable = (perm === 'edit')`.

## web
- Share dialog on the note page: toggle sharing on, choose view/edit, copy link.
- `/share/:token` page: if logged out → login then return; calls `join`; redirects to `/notes/:id`.
- Dashboard "Shared with me" section from `GET /api/notes/shared`.

## Implementation tasks
1. `@yapper/permissions` derivation + Redis cache helpers (+ unit tests for the table above).
2. `api` `POST /notes/:id/share` (owner, set access + token, bust cache) → verify token + access.
3. `api` `GET /share/:token` + `POST /share/:token/join` (upsert collaborator) → verify collaborator row.
4. `api` `GET /notes/shared` → verify returns joined notes.
5. `socket.onAuthenticate` → shared derivation + read-only for viewers → verify viewer inbound rejected.
6. web share dialog + `/share/:token` join page + "Shared with me" → verify end-to-end join + view/edit.

## Test plan
- Unit: `effectivePermission` across owner/private/view/edit × collaborator/non-collaborator.
- Integration: viewer connection cannot mutate the doc (server drops updates); editor can.
- Manual: owner shares (view then edit), second account joins via link, sees correct capability, appears
  in "Shared with me".

## Risks / notes
- Token must be cryptographically random + unique; treat as a bearer capability (still gated by login).
- Cache invalidation: bust on every access/collaborator mutation to avoid stale allow/deny.
- Read-only must be enforced at the server, not just the client (client `editable:false` is UX only).
- Changing `access` (view↔edit) for already-connected users: handled fully in 07 (reconnect); here, new
  connections get the new level. Note the limitation; 07 makes live changes force re-evaluation.
