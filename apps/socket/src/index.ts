import { Database } from "@hocuspocus/extension-database";
import { type Hocuspocus, Server } from "@hocuspocus/server";
import { verifyJwt } from "@yapper/auth";
import { type AuthorizeDeps, authorizeConnection, type ConnectionContext } from "./auth";
import { awarenessUserFor } from "./identity";
import { saveDerivedMetadata } from "./metadata";
import { loadDocState, loadNoteOwner, saveDocState } from "./persistence";
import { buildRedisExtension } from "./redis";

const defaultPort = Number(process.env.SOCKET_PORT ?? 1234);

export interface BuildServerOptions {
  port?: number;
  /** JWT verifier; defaults to the JWKS-backed `verifyJwt`. Injectable for tests. */
  verifyToken?: AuthorizeDeps["verifyToken"];
  /** Debounce window (ms) for `onStoreDocument`. Defaults to Hocuspocus' ~2s. */
  debounce?: number;
  maxDebounce?: number;
}

/**
 * Build the Hocuspocus server. Single instance, owner-only this slice:
 * - `onAuthenticate`: verify the JWT, then require note ownership (rejects otherwise).
 * - `Database`: load/persist the full Yjs state to `note_doc` (debounced ~2s).
 * - `onStoreDocument`: also derive `note.title/preview/updated_at` from the doc.
 *
 * Kept separate from `listen()` so tests can boot it in-process with an injected verifier.
 */
export function buildServer(options: BuildServerOptions = {}): Hocuspocus {
  const verifyToken = options.verifyToken ?? verifyJwt;
  // Cross-instance fanout for doc updates + awareness (and the revoke bus slice 07 reuses). Only
  // wired when REDIS_URL is set, so single-instance dev and tests run without Redis.
  const redis = buildRedisExtension();

  return Server.configure({
    port: options.port ?? defaultPort,
    ...(options.debounce !== undefined ? { debounce: options.debounce } : {}),
    ...(options.maxDebounce !== undefined ? { maxDebounce: options.maxDebounce } : {}),
    extensions: [
      ...(redis ? [redis] : []),
      new Database({
        fetch: async ({ documentName }) => {
          const state = await loadDocState(documentName);
          return state ?? null;
        },
        store: async ({ documentName, state }) => {
          await saveDocState(documentName, Buffer.from(state));
        },
      }),
    ],
    async onAuthenticate({ token, documentName }) {
      return authorizeConnection({ token, documentName }, { verifyToken, loadNoteOwner });
    },
    // Identity is server-authoritative: stamped from the verified JWT in `onAuthenticate`, then
    // pushed to this client so it renders its own awareness label without self-declaring identity
    // (anti-spoof — ADR-002). The client only ever broadcasts cursor *geometry*.
    async connected({ context, connectionInstance }) {
      const { userId, name } = context as ConnectionContext;
      const payload = JSON.stringify({
        type: "identity",
        user: awarenessUserFor({ userId, name }),
      });
      connectionInstance.sendStateless(payload);
    },
    async onStoreDocument({ documentName, document }) {
      await saveDerivedMetadata(documentName, document);
    },
    async onListen() {
      console.log(`[socket] hocuspocus listening on ws://localhost:${options.port ?? defaultPort}`);
    },
  });
}

// Boot only when run directly — importing this module (tests) must not start listening.
if (import.meta.main) {
  buildServer().listen();
}
