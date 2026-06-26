import { db, note } from "@yapper/db";
import { desc, eq } from "drizzle-orm";
import { type Request, type RequestHandler, type Response, Router } from "express";

/**
 * Ownership check for slice 03 (owner-only access). Kept in one place so slice 06 can swap it
 * for `@yapper/permissions` derivation without touching the route handlers (ADR-001).
 */
function ownsNote(row: { ownerId: string }, userId: string): boolean {
  return row.ownerId === userId;
}

/**
 * Wraps a handler so `req.userId` (guaranteed by {@link requireAuth}) is passed in as a
 * non-nullable `string`, and async rejections are forwarded to Express' error handler.
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

/**
 * Notes CRUD, mounted at `/api/notes`. Every route is gated by the supplied auth middleware.
 * List/get select metadata columns only — never the CRDT blob in `note_doc` (slice 04).
 */
export function notesRouter(requireAuthMw: RequestHandler): Router {
  const router = Router();
  router.use(requireAuthMw);

  // POST /api/notes — create an owned note with defaults (Untitled / private).
  router.post(
    "/",
    authed(async (_req, res, userId) => {
      const [created] = await db
        .insert(note)
        .values({ ownerId: userId })
        .returning({
          id: note.id,
          title: note.title,
          access: note.access,
          updatedAt: note.updatedAt,
        });
      res.status(201).json(created);
    }),
  );

  // GET /api/notes — list the caller's owned notes, newest first (metadata only).
  router.get(
    "/",
    authed(async (_req, res, userId) => {
      const rows = await db
        .select({
          id: note.id,
          title: note.title,
          preview: note.preview,
          updatedAt: note.updatedAt,
        })
        .from(note)
        .where(eq(note.ownerId, userId))
        .orderBy(desc(note.updatedAt));
      res.json(rows);
    }),
  );

  // GET /api/notes/:id — owner-only metadata. 404 if absent, 403 if owned by someone else.
  router.get(
    "/:id",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const [row] = await db
        .select({
          id: note.id,
          ownerId: note.ownerId,
          title: note.title,
          preview: note.preview,
          access: note.access,
          createdAt: note.createdAt,
          updatedAt: note.updatedAt,
        })
        .from(note)
        .where(eq(note.id, id))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!ownsNote(row, userId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const { ownerId: _ownerId, ...metadata } = row;
      res.json(metadata);
    }),
  );

  // DELETE /api/notes/:id — owner-only. Cascades to note_doc + note_collaborator via FKs.
  router.delete(
    "/:id",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const [row] = await db
        .select({ ownerId: note.ownerId })
        .from(note)
        .where(eq(note.id, id))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!ownsNote(row, userId)) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      await db.delete(note).where(eq(note.id, id));
      res.status(204).end();
    }),
  );

  return router;
}
