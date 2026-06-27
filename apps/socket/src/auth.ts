/** Per-connection identity stored on the Hocuspocus `context` once the handshake is authorized. */
export interface ConnectionContext {
  userId: string;
}

export interface AuthorizeDeps {
  /** Verify the handshake JWT statelessly (JWKS) → the authenticated `userId`. Throws if invalid. */
  verifyToken: (token: string) => Promise<{ userId: string }>;
  /** Look up a note's owner id by its id (the Hocuspocus `documentName`); `null` if absent. */
  loadNoteOwner: (noteId: string) => Promise<string | null>;
}

/**
 * Authorize a Hocuspocus WebSocket handshake. Verifies the JWT first (never trusts client-supplied
 * identity), then enforces the slice-04 rule: **only the note's owner may connect**. Throwing
 * rejects the connection. Sharing/permissions replace the owner check with `@yapper/permissions`
 * in slice 06 (ADR-003).
 */
export async function authorizeConnection(
  params: { token: string; documentName: string },
  deps: AuthorizeDeps,
): Promise<ConnectionContext> {
  const { userId } = await deps.verifyToken(params.token);
  const ownerId = await deps.loadNoteOwner(params.documentName);
  if (!ownerId) throw new Error(`Note not found: ${params.documentName}`);
  if (ownerId !== userId) throw new Error("Forbidden: not the note owner");
  return { userId };
}
