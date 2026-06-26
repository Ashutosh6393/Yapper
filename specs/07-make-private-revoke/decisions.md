# 07 · Make Private & Revoke — Decisions

## ADR-001: Revoke rotates/invalidates the token (no reactivation)
### Context
Grilling Q9: "private" must mean cut off; a leaked old link must not silently come back.
### Options Considered
1. Flag-only toggle, same token reactivates on re-share — convenient but a security footgun.
2. Rotate: null the token on private, mint a fresh one on re-share — old links dead forever.
### Decision
Option 2. Make-private nulls `share_token`; re-share generates a new one. Collaborators marked revoked.
### Consequences
- Re-share requires distributing the new link; previous collaborators must re-join. Correct "revoked" semantics.

## ADR-002: Live disconnect via the Redis revoke channel
### Context
Connected collaborators may be spread across multiple socket instances.
### Decision
`api` publishes `revoke:{noteId}` on the Redis bus (same one as awareness/doc fanout, slice 05); every
`socket` instance closes that note's **non-owner** connections with a reason code.
### Consequences
- Disconnect is global, not instance-local. Owner is always excluded from the kick.

## ADR-003: Atomic make-private transaction
### Context
A partial revoke could leave a usable link or active collaborator.
### Decision
access=private + token=NULL + collaborators→revoked + cache bust happen in one DB transaction; the Redis
publish follows commit.
### Consequences
- No half-revoked state; the broadcast only fires after durable state change.

## ADR-004: edit→view reuses the same reconnect machinery
### Context
Demoting a connected editor must actually remove their write ability live (slice 06 left this open).
### Decision
A `role-change:{noteId}` event forces affected connections to reconnect; `onAuthenticate` re-runs and
returns them read-only.
### Consequences
- One mechanism (forced reconnect + re-auth) covers both private-kick and role downgrade.
