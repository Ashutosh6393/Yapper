import { auth } from "@yapper/auth";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";
import { requireAuth, type SessionResolver } from "./auth/requireAuth";
import { labelsRouter } from "./labels/router";
import { notesRouter } from "./notes/router";
import { permCache } from "./permissions";
import { redisPublisher } from "./redis";
import { shareRouter } from "./share/router";
import type { PostCommitDeps } from "./sync/mutators";
import { syncRouter } from "./sync/router";

export interface CreateAppOptions {
  /**
   * Override how the session is resolved. Defaults to validating the Better Auth cookie.
   * Tests inject a fake resolver to exercise gated routes without a real OAuth session.
   */
  resolveSession?: SessionResolver;
  /**
   * Post-commit deps for the sync push handler (cache bust + Redis publish). Defaults to the api's
   * module singletons; tests inject a mock publisher to assert revoke/role-change/poke publishes.
   */
  syncDeps?: PostCommitDeps;
}

/**
 * Convenience factory for tests: `skipAuth: true` wires up a fake session resolver that reads
 * the user id from the `x-test-user-id` header, so routes can be exercised without real OAuth.
 */
export function buildApp(
  options: { skipAuth?: boolean; syncDeps?: PostCommitDeps } = {},
): ReturnType<typeof createApp> {
  if (options.skipAuth) {
    return createApp({
      resolveSession: async (req) => {
        const id = req.header("x-test-user-id");
        return id && id.length > 0 ? id : null;
      },
      syncDeps: options.syncDeps,
    });
  }
  return createApp({ syncDeps: options.syncDeps });
}

/** Builds the Express app. Kept separate from `listen` so tests can mount it in-process. */
export function createApp(options: CreateAppOptions = {}): Express {
  const app = express();
  const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

  app.use(cors({ origin: webOrigin, credentials: true }));

  // Better Auth owns everything under /api/auth/* (session, OAuth, JWKS, token).
  // Mounted before express.json() so it can read the raw request body itself.
  app.all("/api/auth/*", toNodeHandler(auth));

  app.use(express.json());

  app.get("/health", (_req, res) => {
    res.json({ status: "ok" });
  });

  const syncDeps: PostCommitDeps = options.syncDeps ?? { permCache, publisher: redisPublisher };

  app.use("/api/notes", notesRouter(requireAuth(options.resolveSession), syncDeps.publisher));
  app.use("/api/labels", labelsRouter(requireAuth(options.resolveSession)));
  app.use("/api/share", shareRouter(requireAuth(options.resolveSession)));
  app.use("/api/sync", syncRouter(requireAuth(options.resolveSession), syncDeps));

  return app;
}
