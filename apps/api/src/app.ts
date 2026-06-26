import { auth } from "@yapper/auth";
import { toNodeHandler } from "better-auth/node";
import cors from "cors";
import express, { type Express } from "express";
import { requireAuth, type SessionResolver } from "./auth/requireAuth";
import { notesRouter } from "./notes/router";

export interface CreateAppOptions {
  /**
   * Override how the session is resolved. Defaults to validating the Better Auth cookie.
   * Tests inject a fake resolver to exercise gated routes without a real OAuth session.
   */
  resolveSession?: SessionResolver;
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

  app.use("/api/notes", notesRouter(requireAuth(options.resolveSession)));

  return app;
}
