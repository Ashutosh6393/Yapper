import { db, note, noteCollaborator } from "@yapper/db";
import { bustUserPermission } from "@yapper/permissions";
import { and, eq, ne } from "drizzle-orm";
import { type Request, type RequestHandler, type Response, Router } from "express";
import { permCache } from "../permissions";

/**
 * Wraps a handler so `req.userId` (guaranteed by `requireAuth`) is passed as a non-nullable string,
 * and async rejections forward to Express' error handler. (Mirrors the helper in notes/router.)
 */
function authed(
  handler: (req: Request, res: Response, userId: string) => Promise<void>,
): RequestHandler {
  return (req, res, next) => {
    const userId = req.userId;
    if (!userId) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }
    handler(req, res, userId).catch(next);
  };
}

/** Look up a shared (non-private) note by its capability token; `null` if none matches. */
async function findSharedNote(token: string) {
  const [row] = await db
    .select({ id: note.id, title: note.title, access: note.access, ownerId: note.ownerId })
    .from(note)
    .where(and(eq(note.shareToken, token), ne(note.access, "private")))
    .limit(1);
  return row ?? null;
}

/**
 * Capability-link join flow, mounted at `/api/share`. Every route requires a session — opening a
 * share link still mandates login (ADR-002). The token is a bearer capability; possession + login
 * is what grants access.
 */
export function shareRouter(requireAuthMw: RequestHandler): Router {
  const router = Router();
  router.use(requireAuthMw);

  // GET /api/share/:token — note summary for the join page. 404 if the token is unknown/private.
  router.get(
    "/:token",
    authed(async (req, res) => {
      const { token } = req.params;
      const row = token ? await findSharedNote(token) : null;
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      res.json({ id: row.id, title: row.title, access: row.access });
    }),
  );

  // POST /api/share/:token/join — upsert the caller as an active collaborator, then redirect target.
  router.post(
    "/:token/join",
    authed(async (req, res, userId) => {
      const { token } = req.params;
      const row = token ? await findSharedNote(token) : null;
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      // The owner opening their own link needs no collaborator row.
      if (row.ownerId !== userId) {
        await db
          .insert(noteCollaborator)
          .values({ noteId: row.id, userId, status: "active" })
          .onConflictDoUpdate({
            target: [noteCollaborator.noteId, noteCollaborator.userId],
            set: { status: "active", lastAccess: new Date() },
          });
        // The caller's permission just changed (now an active collaborator) — drop the stale entry.
        await bustUserPermission(permCache, row.id, userId);
      }
      res.json({ noteId: row.id });
    }),
  );

  return router;
}
