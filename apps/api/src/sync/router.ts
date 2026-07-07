import { type RequestHandler, Router } from "express";
import { authed } from "../authed";
import type { PostCommitDeps } from "./mutators";
import { handlePush } from "./push";

/**
 * Sync-engine routes, mounted at `/api/sync` behind `requireAuth` (spec 19). Only `POST /push` for now;
 * the puller (`/pull`) and poke stream (`/stream`) are specs 16/17. `deps` carries the post-commit
 * cache/publisher so tests can inject a mock publisher.
 */
export function syncRouter(requireAuthMw: RequestHandler, deps: PostCommitDeps): Router {
  const router = Router();
  router.use(requireAuthMw);
  const push = handlePush(deps);
  router.post(
    "/push",
    authed(async (req, res) => push(req, res)),
  );
  return router;
}
