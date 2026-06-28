import { randomBytes } from "node:crypto";
import { db, note, noteCollaborator } from "@yapper/db";
import { bustNotePermissions, revokeChannel, roleChangeChannel } from "@yapper/permissions";
import { and, desc, eq, ne } from "drizzle-orm";
import { type Request, type RequestHandler, type Response, Router } from "express";
import { permCache, resolvePerm } from "../permissions";
import { redisPublisher } from "../redis";

/** Owner-only check, used by mutations the owner alone may perform (delete, share). */
function ownsNote(row: { ownerId: string }, userId: string): boolean {
  return row.ownerId === userId;
}

/** Where the share link points; the web app serves `/share/:token`. */
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

/** A cryptographically-random, URL-safe bearer token for a capability link (still gated by login). */
function mintShareToken(): string {
  return randomBytes(24).toString("base64url");
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
      const [created] = await db.insert(note).values({ ownerId: userId }).returning({
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

  // GET /api/notes/shared — the caller's "Shared with me": notes they joined (active collaborator)
  // that are still shared (not back to private). Metadata only. Registered before "/:id".
  router.get(
    "/shared",
    authed(async (_req, res, userId) => {
      const rows = await db
        .select({
          id: note.id,
          title: note.title,
          preview: note.preview,
          access: note.access,
          updatedAt: note.updatedAt,
        })
        .from(noteCollaborator)
        .innerJoin(note, eq(noteCollaborator.noteId, note.id))
        .where(
          and(
            eq(noteCollaborator.userId, userId),
            eq(noteCollaborator.status, "active"),
            ne(note.access, "private"),
          ),
        )
        .orderBy(desc(note.updatedAt));
      res.json(rows);
    }),
  );

  // GET /api/notes/:id — metadata, readable by anyone with view/edit (owner or active collaborator).
  // 404 if absent, 403 if the caller has no permission. Gate uses the shared derivation (ADR-001).
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
      if ((await resolvePerm(id, userId)) === "none") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      // Tell the client whether it owns the note (gates the Share/Delete UI) without leaking the
      // owner's id; sharing itself is still enforced owner-only server-side.
      const { ownerId, ...metadata } = row;
      res.json({ ...metadata, isOwner: ownerId === userId });
    }),
  );

  // POST /api/notes/:id/share — owner enables/updates sharing: set access (view|edit), mint a token
  // if absent, bust the note's cached permissions, and return the capability link.
  router.post(
    "/:id/share",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      const level = (req.body as { level?: unknown }).level;
      if (level !== "view" && level !== "edit") {
        res.status(400).json({ error: "level must be 'view' or 'edit'" });
        return;
      }
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const [row] = await db
        .select({ ownerId: note.ownerId, shareToken: note.shareToken })
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
      const token = row.shareToken ?? mintShareToken();
      await db
        .update(note)
        .set({ access: level, shareToken: token, updatedAt: new Date() })
        .where(eq(note.id, id));
      // Everyone's effective permission on this note may have changed — drop all cached entries.
      await bustNotePermissions(permCache, id);
      await redisPublisher?.publish(roleChangeChannel(id), JSON.stringify({ newLevel: level }));
      res.json({ token, url: `${webOrigin}/share/${token}`, access: level });
    }),
  );

  // POST /api/notes/:id/private — owner only. Atomically: set access=private, clear shareToken,
  // revoke all collaborators, bust perm cache, then publish revoke event to all socket instances.
  router.post(
    "/:id/private",
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
      await db.transaction(async (tx) => {
        await tx
          .update(note)
          .set({ access: "private", shareToken: null, updatedAt: new Date() })
          .where(eq(note.id, id));
        await tx
          .update(noteCollaborator)
          .set({ status: "revoked" })
          .where(eq(noteCollaborator.noteId, id));
      });
      await bustNotePermissions(permCache, id);
      await redisPublisher?.publish(revokeChannel(id), JSON.stringify({ reason: "made_private" }));
      res.status(204).end();
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
