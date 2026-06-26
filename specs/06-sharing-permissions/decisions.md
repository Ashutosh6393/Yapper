# 06 · Sharing & Permissions — Decisions

## ADR-001: Single permission derivation shared by api + socket
### Context
HTTP route guards and the WS handshake must agree exactly on who can do what.
### Decision
`effectivePermission(...)` lives only in `@yapper/permissions`; both services import it. Redis-cached.
### Consequences
- No drift between REST and realtime enforcement; one place to audit/change permission rules.

## ADR-002: Note-level role, capability link with mandatory login
### Context
Grilling Q7/Q8: share a link, owner controls view-vs-edit globally, accessors must be logged in + tracked.
### Decision
`note.access` (view/edit) is the role for everyone joining via `share_token`; opening the link requires
login and materializes an active `note_collaborator` row.
### Consequences
- No per-person roles (simpler UI/check); identity tracked for cursors + "Shared with me" + revocation (07).

## ADR-003: Server-side read-only enforcement for viewers
### Context
In a CRDT every client holds the full doc and can emit updates; client-only read-only is cosmetic.
### Decision
`onAuthenticate` returns a Hocuspocus **readOnly** connection for `view`; server drops inbound updates,
still streams outbound + awareness. Client `editable:false` for UX.
### Consequences
- View-only is tamper-resistant. Live role changes (view↔edit) for connected users handled in slice 07.
