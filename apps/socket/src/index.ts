import { Database } from "@hocuspocus/extension-database";
import { type Hocuspocus, Server } from "@hocuspocus/server";
import { verifyJwt } from "@yapper/auth";
import {
  buildRedisPublisher,
  buildResolveDeps,
  loadNote,
  resolvePermission,
} from "@yapper/permissions";
import type { SocketServerMessage } from "@yapper/schemas";
import type IORedis from "ioredis";
import { type AuthorizeDeps, authorizeConnection, type ConnectionContext } from "./auth";
import { awarenessUserFor } from "./identity";
import { saveDerivedMetadata } from "./metadata";
import { loadDocState, saveDocState } from "./persistence";
import { buildRedisExtension } from "./redis";
import { setupRevokeSubscriber } from "./revoke";

const defaultPort = Number(process.env.SOCKET_PORT ?? 1234);

export interface BuildServerOptions {
  port?: number;
  /** JWT verifier; defaults to the JWKS-backed `verifyJwt`. Injectable for tests. */
  verifyToken?: AuthorizeDeps["verifyToken"];
  /** Effective-permission resolver; defaults to the shared `@yapper/permissions` derivation. Injectable for tests. */
  resolvePermission?: AuthorizeDeps["resolvePermission"];
  /** Note loader; defaults to the db-backed `loadNote` from `@yapper/permissions`. Injectable for tests. */
  loadNote?: AuthorizeDeps["loadNote"];
  /** Debounce window (ms) for `onStoreDocument`. Defaults to Hocuspocus' ~2s. */
  debounce?: number;
  maxDebounce?: number;
}

/**
 * Build the Hocuspocus server. Single instance:
 * - `onAuthenticate`: verify the JWT, derive effective permission (`@yapper/permissions`) → reject
 *   `none`, mark `view` connections read-only (server drops their inbound updates), allow `edit`.
 * - `Database`: load/persist the full Yjs state to `note_doc` (debounced ~2s).
 * - `onStoreDocument`: also derive `note.title/preview/updated_at` from the doc.
 *
 * Kept separate from `listen()` so tests can boot it in-process with injected verifier/permissions.
 */
export function buildServer(options: BuildServerOptions = {}): Hocuspocus {
  const verifyToken = options.verifyToken ?? verifyJwt;
  // Same cache-first derivation the api uses, so REST and realtime never disagree (ADR-001).
  const resolveDeps = buildResolveDeps();
  const resolvePerm =
    options.resolvePermission ??
    ((noteId: string, userId: string) => resolvePermission(noteId, userId, resolveDeps));
  const loadNoteFn = options.loadNote ?? loadNote;
  // Cross-instance fanout for doc updates + awareness (and the revoke bus slice 07 reuses). Only
  // wired when REDIS_URL is set, so single-instance dev and tests run without Redis.
  const redis = buildRedisExtension();
  // Publisher for the metadata poke fired after each derived-metadata save (spec 23); null without
  // REDIS_URL, in which case the poke is a no-op and clients still refresh via their pull backstops.
  const pokePublisher = buildRedisPublisher();

  const server = Server.configure({
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
    async onAuthenticate({ token, documentName, connection }) {
      const { context, readOnly } = await authorizeConnection(
        { token, documentName },
        { verifyToken, resolvePermission: resolvePerm, loadNote: loadNoteFn },
      );
      // Server-side read-only for viewers: Hocuspocus then drops this connection's inbound doc
      // updates (still streaming out + awareness). Client `editable:false` is UX only (ADR-003).
      connection.readOnly = readOnly;
      return context;
    },
    // Identity is server-authoritative: stamped from the verified JWT in `onAuthenticate`, then
    // pushed to this client so it renders its own awareness label without self-declaring identity
    // (anti-spoof — ADR-002). The client only ever broadcasts cursor *geometry*. `permission` lets
    // the client toggle editability; the server still enforces read-only regardless.
    async connected({ context, connectionInstance }) {
      const { userId, name, permission } = context as ConnectionContext;
      const message: SocketServerMessage = {
        type: "identity",
        user: awarenessUserFor({ userId, name }),
        permission,
      };
      connectionInstance.sendStateless(JSON.stringify(message));
    },
    async onStoreDocument({ documentName, document }) {
      await saveDerivedMetadata(documentName, document, pokePublisher);
    },
    async onListen() {
      console.log(`[socket] hocuspocus listening on ws://localhost:${options.port ?? defaultPort}`);
    },
  });

  // Wire up the Redis revoke subscriber (no-op when REDIS_URL is unset).
  const redisUrl = process.env.REDIS_URL;
  let revokeSubscriber: IORedis | null = null;
  if (redisUrl) {
    revokeSubscriber = setupRevokeSubscriber(server, redisUrl);
  }

  // Patch destroy to also clean up the revoke subscriber.
  const originalDestroy = server.destroy.bind(server);
  server.destroy = async () => {
    await revokeSubscriber?.quit();
    await pokePublisher?.quit();
    return originalDestroy();
  };

  return server;
}

// Boot only when run directly — importing this module (tests) must not start listening.
if (import.meta.main) {
  buildServer().listen();
}
