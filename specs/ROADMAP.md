# Yapper Implementation Roadmap

Vertical slices, dependency-ordered. Each slice is a standalone, testable spec with an
explicit **goal state**. Build them in order; do not start a slice until the one it depends
on is `done`. See `architecture.html` (repo root) for the system diagrams these specs implement.

| # | Spec | Depends on | Status | Goal state (acceptance) |
|---|------|-----------|--------|--------------------------|
| 00 | [project-setup](./00-project-setup/design.md) | — | **done** | `docker compose up -d` runs Postgres+Redis; `bun run dev` boots web/api/socket; `GET /health` → 200; `biome check` + `check-types` pass |
| 01 | [database-package](./01-database-package/design.md) | 00 | **done** | `@yapper/db` exposes a typed Drizzle client; `drizzle-kit` migrations create `note`, `note_doc`, `note_collaborator`; insert/select round-trips |
| 02 | [auth](./02-auth/design.md) | 01 | **done** | Google/GitHub login sets a session; `/dashboard` gated; Better Auth tables exist; JWKS endpoint + `verifyJwt` helper validate a token |
| 03 | [notes-dashboard](./03-notes-dashboard/design.md) | 02 | **done** | Logged-in user creates / lists / opens / deletes their own notes via REST + "My Notes" UI; routes gated by auth |
| 04 | [editor-realtime](./04-editor-realtime/design.md) | 03 | **done** | Owner edits rich text; Hocuspocus persists Yjs state to `note_doc`; title/preview derived; reload preserves content |
| 05 | [collab-cursors](./05-collab-cursors/design.md) | 04 | **done** | Two clients on one note sync edits + see live cursors/selections + presence, via Redis fanout across socket instances |
| 06 | [sharing-permissions](./06-sharing-permissions/design.md) | 05 | **done** | Capability link → login → join as collaborator; view/edit enforced server-side; "Shared with me" lists joined notes |
| 07 | [make-private-revoke](./07-make-private-revoke/design.md) | 06 | **done** | Owner toggles private → collaborators instantly disconnected with "note made private by owner"; token rotated; owner stays connected |

## Status legend
`not-started` → `in-progress` → `done`. Update the row above **and** the slice's
`implementation.md` `Status:` line whenever status changes.

## Cross-cutting conventions (apply to every slice)
- **Package scope:** workspace packages are published under `@yapper/*` (e.g. `@yapper/db`).
- **PR size:** keep each PR < 500 LOC / < 10 code files (see root `AGENTS.md`). Split a slice
  into multiple PRs if needed, but the slice's goal state is the merge-complete bar.
- **Quality gate per PR:** `biome check` clean, `bun run check-types` clean, slice tests green.
- **No secrets committed:** every app reads config from `.env` (provide `.env.example`).
- **Permission logic lives once:** in `@yapper/permissions`, imported by both `api` and `socket`.
