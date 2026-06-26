# 06 · Sharing & Permissions — Future Work

## Enhancements
- Per-collaborator role overrides (beyond the note-level role).
- Multiple links per note (separate view-link / edit-link) or expiring links.
- Owner view of the collaborator list with remove-individual action.

## Technical Debt
- Live view↔edit change for already-connected users is completed in slice 07 (reconnect); here only new
  connections pick up the new level.
- Cache invalidation is manual on each mutation; consider a small helper/event to centralize busting.

## Nice to Have
- "Copied!" feedback + QR for the share link.
- Email the link to a specific person.
