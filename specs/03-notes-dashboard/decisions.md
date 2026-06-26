# 03 · Notes & Dashboard — Decisions

## ADR-001: Owner-only authorization now, generalized in slice 06
### Context
Sharing/permissions don't exist yet; notes are private to their owner.
### Decision
Gate routes with `owner_id === req.userId` inside a single helper, designed to be replaced by
`@yapper/permissions` derivation in slice 06 without touching route handlers.
### Consequences
- Minimal logic now; one swap point later. No premature permission abstraction.

## ADR-002: `/notes/:id` ships as a shell
### Context
The editor (TipTap/Yjs) is a separate vertical slice (04).
### Decision
This slice renders metadata + a placeholder on the note page; slice 04 replaces the placeholder.
### Consequences
- Dashboard + CRUD are independently testable before any realtime complexity.

## ADR-003: Create defaults — Untitled / private
### Context
Title is derived from content (slice 04); a brand-new note has no content.
### Decision
New notes start `title='Untitled'`, `preview=''`, `access='private'`. Title/preview get denormalized
from the doc once editing exists (slice 04).
### Consequences
- Dashboard shows "Untitled" until the user types in slice 04.
