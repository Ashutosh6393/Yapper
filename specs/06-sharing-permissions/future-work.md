# 06 · Sharing & Permissions — Future Work

## Enhancements
- Per-collaborator role overrides (beyond the note-level role).
- Multiple links per note (separate view-link / edit-link) or expiring links.
- Owner view of the collaborator list with remove-individual action.

## Technical Debt
- **Live view↔edit change does not propagate to already-connected users in slice 06** — only *new*
  connections pick up the new level, because `socket.onAuthenticate` evaluates permission once at
  connect time. So after the owner changes the level, connected users must **manually refresh**:
  - **view→edit:** a promoted viewer can't edit until they reload (UX gap).
  - **edit→view:** a demoted editor keeps editing locally until they reload (**enforcement gap** — the
    server still drops their inbound updates only if the connection was read-only *at connect*).
  Completed in **slice 07** via the `role-change:{noteId}` reconnect machinery (forces affected
  connections to re-run `onAuthenticate` at the new level). See `specs/07-make-private-revoke/design.md`
  goal state 7 + task 5.
- Cache invalidation is manual on each mutation; consider a small helper/event to centralize busting.

## Nice to Have
- "Copied!" feedback + QR for the share link.
- Email the link to a specific person.
