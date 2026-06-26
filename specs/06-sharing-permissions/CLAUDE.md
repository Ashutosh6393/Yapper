# CLAUDE.md — 06 · Sharing & Permissions

## Project Context
Capability-link sharing with login, a note-level view/edit role, server-enforced read-only for viewers,
and "Shared with me". One permission rule (`@yapper/permissions`) drives both `api` and `socket`.

## Before Starting Work
1. Read `design.md` (the derivation table is the contract).
2. Ensure slices 04 + 05 done (editing + realtime + Redis).
3. Check `implementation.md`.

## Code Patterns
- `effectivePermission(userId, note, isActiveCollaborator) -> 'none'|'view'|'edit'` lives only in
  `@yapper/permissions`; `api` guards and `socket.onAuthenticate` both call it. No duplicate logic.
- Redis cache: `perm:{noteId}:{userId}`, short TTL, busted on access/collaborator change.
- Viewer = Hocuspocus **readOnly** connection (server drops inbound updates); client `editable:false` is UX only.
- Share token is a CSPRNG value, unique, treated as a bearer capability (still requires login to use).

## Don't
- Don't enforce view-only on the client alone — server is the gate.
- Don't implement make-private/revoke/token-rotation/live-disconnect here (slice 07).
- Don't fork the permission logic into `api` and `socket` — single source in `@yapper/permissions`.
- Don't forget to bust the perm cache on mutations.
