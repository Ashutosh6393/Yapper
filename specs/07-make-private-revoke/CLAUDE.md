# CLAUDE.md — 07 · Make Private & Revoke

## Project Context
The owner's private toggle: atomically revoke access, rotate the token, and instantly disconnect all
non-owner collaborators across every socket instance with "note made private by owner". Re-share mints a
fresh link. Same machinery forces read-only reconnection on edit→view.

## Before Starting Work
1. Read `design.md`.
2. Ensure slice 06 done (sharing, collaborators, permission derivation, Redis cache).
3. Confirm the Redis fanout channel convention from slice 05.
4. Check `implementation.md`.

## Code Patterns
- Make-private is one DB **transaction**: access=private, token=NULL, collaborators→revoked, bust cache,
  then `PUBLISH revoke:{noteId}`.
- `socket` reacts to the Redis revoke event and closes **non-owner** connections with a reason code; owner excluded.
- web distinguishes the server reason code (`note_made_private`) from transient closes before showing the message.
- Re-share reuses slice-06 share endpoint; it mints a new token when `share_token` is null (never reuses old).

## Don't
- Don't disconnect or revoke the owner.
- Don't only close local connections — broadcast via Redis so all instances act.
- Don't reactivate old tokens on re-share (rotate, never reuse).
- Don't perform a partial revoke — wrap in a transaction.
