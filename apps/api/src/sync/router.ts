import { type RequestHandler, Router } from "express";
import { authed } from "../authed";
import type { PostCommitDeps } from "./mutators";
import { handlePull } from "./pull";
import { handlePush } from "./push";

/**
 * Sync-engine routes, mounted at `/api/sync` behind `requireAuth`. `POST /push` (spec 19) applies the
 * client's queued mutations; `POST /pull` (spec 16) returns the CVR metadata delta. The poke stream
 * (`/stream`) is spec 17. `deps` carries the post-commit cache/publisher so tests can inject a mock
 * publisher (pull has no post-commit side effects, so it takes no deps).
 */
export function syncRouter(requireAuthMw: RequestHandler, deps: PostCommitDeps): Router {
  const router = Router();
  router.use(requireAuthMw);
  const push = handlePush(deps);
  const pull = handlePull();
  router.post(
    "/push",
    authed(async (req, res) => push(req, res)),
  );
  router.post(
    "/pull",
    authed(async (req, res) => pull(req, res)),
  );
  return router;
}
