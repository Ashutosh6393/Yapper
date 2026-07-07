import { type RequestHandler, Router } from "express";
import { authed } from "../authed";
import type { PostCommitDeps } from "./mutators";
import { handlePull } from "./pull";
import { handlePush } from "./push";
import { handleStream } from "./stream";

/**
 * Sync-engine routes, mounted at `/api/sync` behind `requireAuth`. `POST /push` (spec 19) applies the
 * client's queued mutations; `POST /pull` (spec 16) returns the CVR metadata delta; `GET /stream`
 * (spec 17) is the long-lived SSE poke channel. `deps` carries the post-commit cache/publisher so tests
 * can inject a mock publisher (pull/stream have no post-commit side effects, so they take no deps).
 */
export function syncRouter(requireAuthMw: RequestHandler, deps: PostCommitDeps): Router {
  const router = Router();
  router.use(requireAuthMw);
  const push = handlePush(deps);
  const pull = handlePull();
  const stream = handleStream();
  router.post(
    "/push",
    authed(async (req, res) => push(req, res)),
  );
  router.post(
    "/pull",
    authed(async (req, res) => pull(req, res)),
  );
  router.get("/stream", authed(stream));
  return router;
}
