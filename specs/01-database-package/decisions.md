# 01 · Database Package — Decisions

## ADR-001: Separate `note_doc` table for the CRDT blob
### Context
The Yjs state is written hot on every debounced save and can be large; dashboard queries must stay cheap.
### Options Considered
1. `yjs_state bytea` column on `note` — one table, but list queries risk dragging the blob; two writers
   (api metadata vs socket doc) contend on the same row.
2. Separate `note_doc(note_id, state, updated_at)` — list queries never touch the blob; writers isolated.
### Decision
Separate `note_doc` table (1:1 with `note`, cascade delete).
### Consequences
- `socket` writes `note_doc`; `api` writes `note` metadata — clean ownership boundary.

## ADR-002: Effective permission is derived, not stored per collaborator
### Context
Sharing role is note-level (`access` enum), not per person (grilling Q8).
### Decision
`note_collaborator` stores membership + `status` only — no role column. Effective permission is computed
(`@yapper/permissions`, slice 06) from `note.access` + ownership + active membership.
### Consequences
- Flipping `note.access` instantly changes everyone's effective permission; no per-row backfill.

## ADR-003: FK to `user` deferred to slice 02
### Context
Better Auth owns the `user` table and creates it in slice 02.
### Decision
Define `owner_id` / `user_id` as uuid columns now; add the FK constraints in 02's migration once `user` exists.
### Consequences
- Brief window where referential integrity to `user` is app-enforced only; closed in 02.
