import { db, label, note, noteLabel } from "@yapper/db";
import { createLabelBodySchema } from "@yapper/schemas";
import { and, count, eq, isNull } from "drizzle-orm";
import { type RequestHandler, Router } from "express";
import { authed } from "../authed";
import { deleteLabelById, insertLabel } from "./service";

/**
 * Labels CRUD, mounted at `/api/labels`, gated by the supplied auth middleware. Every query is
 * scoped to `owner_id = req.userId` — labels are owner-private (ADR-002). Note-counts include the
 * owner's **active** notes only (archived/trashed excluded).
 */
export function labelsRouter(requireAuthMw: RequestHandler): Router {
  const router = Router();
  router.use(requireAuthMw);

  // GET /api/labels — the caller's labels with a count of active owned notes carrying each.
  router.get(
    "/",
    authed(async (_req, res, userId) => {
      const rows = await db
        .select({
          id: label.id,
          name: label.name,
          color: label.color,
          // count(note.id) counts only rows surviving the filtered join (active notes); a label
          // with no active notes yields 0.
          noteCount: count(note.id),
        })
        .from(label)
        .leftJoin(noteLabel, eq(noteLabel.labelId, label.id))
        .leftJoin(
          note,
          and(eq(note.id, noteLabel.noteId), isNull(note.archivedAt), isNull(note.trashedAt)),
        )
        .where(eq(label.ownerId, userId))
        .groupBy(label.id)
        .orderBy(label.name);
      res.json(rows);
    }),
  );

  // POST /api/labels — create a label { name, color }. 409 if the owner already has that name.
  router.post(
    "/",
    authed(async (req, res, userId) => {
      const parsed = createLabelBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid label", issues: parsed.error.issues });
        return;
      }
      const { name, color } = parsed.data;

      const [existing] = await db
        .select({ id: label.id })
        .from(label)
        .where(and(eq(label.ownerId, userId), eq(label.name, name)))
        .limit(1);
      if (existing) {
        res.status(409).json({ error: "A label with that name already exists" });
        return;
      }

      const created = await insertLabel(db, { ownerId: userId, name, color });
      res.status(201).json({ ...created, noteCount: 0 });
    }),
  );

  // DELETE /api/labels/:id — owner only; cascades to note_label (notes keep existing, lose the label).
  router.delete(
    "/:id",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const [row] = await db
        .select({ ownerId: label.ownerId })
        .from(label)
        .where(eq(label.id, id))
        .limit(1);
      if (!row) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (row.ownerId !== userId) {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      await deleteLabelById(db, id);
      res.status(204).end();
    }),
  );

  return router;
}
