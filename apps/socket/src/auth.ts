import type { Permission } from "@yapper/permissions";
import { colorFromUserId } from "./identity";

/**
 * Per-connection identity stored on the Hocuspocus `context` once the handshake is authorized.
 * `name`/`color` are server-authoritative (sourced from the verified JWT, not the client) and are
 * pushed to the client to render its awareness label — ADR-002/003. `permission` lets the client
 * decide editability (`edit` → editable); the server still enforces read-only regardless.
 * `isOwner` gates slice-07 revoke logic: owner connections are never kicked.
 */
export interface ConnectionContext {
  userId: string;
  name: string;
  color: string;
  permission: Permission;
  isOwner: boolean;
}

/** Outcome of authorizing a handshake: the connection context + whether it must be read-only. */
export interface AuthorizeResult {
  context: ConnectionContext;
  /** `true` for viewers — the server drops their inbound doc updates (ADR-003). */
  readOnly: boolean;
}

export interface AuthorizeDeps {
  /** Verify the handshake JWT statelessly (JWKS) → the authenticated `userId` + display `name`. Throws if invalid. */
  verifyToken: (token: string) => Promise<{ userId: string; name: string }>;
  /** Effective permission for this user on this note (cache-first, via `@yapper/permissions`). */
  resolvePermission: (noteId: string, userId: string) => Promise<Permission>;
  /** Load the note's ownerId to determine if this user is the owner. Returns null if note not found. */
  loadNote: (noteId: string) => Promise<{ ownerId: string } | null>;
}

/**
 * Authorize a Hocuspocus WebSocket handshake. Verifies the JWT first (never trusts client-supplied
 * identity), then derives the user's effective permission via the shared `@yapper/permissions` rule
 * (ADR-001) — identical to the `api` REST guards. `none` rejects the connection; `view` returns a
 * read-only connection (server drops inbound updates — ADR-003); `edit`/owner is read/write.
 */
export async function authorizeConnection(
  params: { token: string; documentName: string },
  deps: AuthorizeDeps,
): Promise<AuthorizeResult> {
  const { userId, name } = await deps.verifyToken(params.token);
  const [permission, noteData] = await Promise.all([
    deps.resolvePermission(params.documentName, userId),
    deps.loadNote(params.documentName),
  ]);
  if (permission === "none") throw new Error("Forbidden: no access to this note");
  return {
    context: {
      userId,
      name,
      color: colorFromUserId(userId),
      permission,
      isOwner: noteData?.ownerId === userId,
    },
    readOnly: permission === "view",
  };
}
