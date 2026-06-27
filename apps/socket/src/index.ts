import { Database } from "@hocuspocus/extension-database";
import { type Hocuspocus, Server } from "@hocuspocus/server";
import { verifyJwt } from "@yapper/auth";
import { type AuthorizeDeps, authorizeConnection } from "./auth";
import { saveDerivedMetadata } from "./metadata";
import { loadDocState, loadNoteOwner, saveDocState } from "./persistence";

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

  return Server.configure({
    port: options.port ?? defaultPort,
    ...(options.debounce !== undefined ? { debounce: options.debounce } : {}),
    ...(options.maxDebounce !== undefined ? { maxDebounce: options.maxDebounce } : {}),
    extensions: [
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
