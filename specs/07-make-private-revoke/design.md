# 07 · Make Private & Revoke — Design

## Goal State (acceptance)
1. The owner has a **private toggle** on the note ("stop live collaboration").
2. Toggling private: `note.access='private'`, `share_token` **rotated/invalidated** (old link dead forever),
   all `note_collaborator` rows for the note marked `status='revoked'`, perm cache busted.
3. Every collaborator **currently connected** is **instantly disconnected**, regardless of which `socket`
   instance they're on, and their UI shows **"note made private by owner"** and routes them out.
4. The **owner stays connected** and keeps editing.
5. A previously shared (now dead) link returns access-denied; the note disappears from collaborators'
   "Shared with me".
6. **Re-enabling sharing** mints a **new** token/link; old links never reactivate; previous collaborators
   must open the new link to regain access.
7. **Live role change (both directions), same machinery.** When the owner changes the note level
   (slice-06 `POST /notes/:id/share`) while users are connected, it takes effect **live — no manual
   refresh** — by forcing affected connections to reconnect so `onAuthenticate` re-evaluates:
   - **edit→view (downgrade):** affected editors come back **read-only**. This closes an enforcement
     gap carried over from slice 06 — until this lands, a demoted editor keeps editing locally until
     they refresh (their existing connection stays read/write, since `onAuthenticate` only runs at
     connect time).
   - **view→edit (upgrade):** affected viewers gain edit ability without reloading.

## Scope
**In:** web private toggle + disconnect handling/message; `api` make-private transaction + Redis revoke
publish + token rotation on re-share; `socket` subscription to the revoke channel → close affected
connections; reconnect-on-role-change.
**Out:** nothing new beyond this; this is the final feature slice.

## Design
- **`api` make-private** (owner, transactional):
  1. `note.access='private'`, `share_token=NULL` (rotate: a later re-share generates a fresh token).
  2. `UPDATE note_collaborator SET status='revoked' WHERE note_id=:id`.
  3. Bust perm cache for the note (and affected users).
  4. `PUBLISH revoke:{noteId}` on Redis with payload `{ reason: 'made_private' }`.
  Return new state. Re-share (slice 06 `POST /notes/:id/share`) mints a new token when `share_token` is null.
- **`socket`** subscribes to `revoke:{noteId}` (same Redis used for fanout). On message: for every
  connection to that document whose user is **not the owner**, close with a reason code
  (`note_made_private`). Owner connections untouched. For a **role change in either direction**
  (`view↔edit`), `api` publishes a `role-change:{noteId}` event → affected non-owner connections are
  forced to reconnect → `onAuthenticate` re-runs and returns each at the new level (read-only for
  `view`, read/write for `edit`). The web client reconnects transparently (no "made private" message).
- **web**: Hocuspocus provider `onClose`/auth-failed handler inspects the reason; on `note_made_private`
  renders a full-page **"note made private by owner"** state and navigates back to the dashboard. Owner's
  toggle updates local state without disconnecting itself.

## Implementation tasks
1. `api` `POST /api/notes/:id/private` (owner): transaction (access, token null, revoke collaborators,
   bust cache) + `PUBLISH revoke:{noteId}` → verify DB state + token cleared.
2. `socket` subscribe to `revoke:{noteId}` → close non-owner connections with reason → verify disconnects.
3. web disconnect handler → "note made private by owner" + route out → verify message shown, owner stays.
4. Re-share path mints a new token (reuse slice-06 share endpoint when `share_token` null) → verify old
   link dead, new link works.
5. `role-change` reconnect for **both directions** while connected: on a slice-06 level change, `api`
   publishes `role-change:{noteId}`; `socket` forces affected non-owner connections to reconnect →
   verify an editor demoted to **view** becomes read-only **without reload**, and a viewer promoted to
   **edit** gains editing **without reload**.

## Test plan
- Integration: connect a collaborator, owner makes private → collaborator socket closes with reason; old
  token → join denied; collaborator gone from "Shared with me"; owner still connected.
- Re-share: new token differs from old; old token rejected; new token joins.
- Manual (two browsers): owner toggles private → other browser shows the message immediately.
- Role change (two browsers): editor demoted to view → loses edit ability live; viewer promoted to
  edit → gains it live. Neither requires a manual page refresh.

## Risks / notes
- Make-private must be atomic (transaction) so a partial revoke can't leave a usable link/collaborator.
- Disconnect must reach **all** instances → rely on the Redis channel from slice 05 (don't loop only local
  connections).
- Distinguish "made private" (permanent, route out) from a transient network close in the web handler
  (use the server-sent reason code).
- Guard against the owner accidentally revoking themselves — owner is always excluded from the kick.
