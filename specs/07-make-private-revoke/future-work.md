# 07 · Make Private & Revoke — Future Work

## Enhancements
- Audit log of share/revoke events per note.
- "Restore previous collaborators" option on re-share (opt-in convenience).
- Granular revoke (remove a single collaborator) without going fully private.

## Technical Debt
- Reason-code handling on the web client should be centralized for all disconnect types.
- Integration coverage for the multi-instance revoke path (currently validated manually).

## Nice to Have
- Toast/confirmation before making private ("X people will be disconnected").
- Temporary "pause collaboration" (freeze) distinct from full revoke.
