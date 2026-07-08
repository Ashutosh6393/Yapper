import { db, label, note, noteCollaborator, noteDoc, noteLabel, user } from "@yapper/db";
import { deriveNoteMetadata } from "@yapper/editor/collab";
import { bustNotePermissions, revokeChannel, roleChangeChannel } from "@yapper/permissions";
import {
  createNoteArgsSchema,
  noteListQuerySchema,
  putNoteContentBodySchema,
  setNoteLabelsBodySchema,
  shareNoteBodySchema,
} from "@yapper/schemas";
import { and, desc, eq, exists, inArray, isNotNull, isNull, ne, sql } from "drizzle-orm";
import { type RequestHandler, type Response, Router } from "express";
import * as Y from "yjs";
import { authed } from "../authed";
import { permCache, resolvePerm } from "../permissions";
import { redisPublisher } from "../redis";
import { createNoteRecord } from "./create";
import {
  archiveNote,
  makeNotePrivate,
  mintShareToken,
  permanentlyDeleteNote,
  restoreNote,
  setNoteShareLevel,
  trashNote,
  unarchiveNote,
} from "./service";

/** Owner-only check, used by mutations the owner alone may perform (delete, share). */
function ownsNote(row: { ownerId: string }, userId: string): boolean {
  return row.ownerId === userId;
}

/**
 * Load + owner-gate a note for a lifecycle/label mutation. Writes the 404/403 response and returns
 * `null` when the caller must stop; otherwise returns the note's `ownerId` + `trashedAt`.
 */
async function requireOwnedNote(
  id: string,
  userId: string,
  res: Response,
): Promise<{ ownerId: string; trashedAt: Date | null } | null> {
  const [row] = await db
    .select({ ownerId: note.ownerId, trashedAt: note.trashedAt })
    .from(note)
    .where(eq(note.id, id))
    .limit(1);
  if (!row) {
    res.status(404).json({ error: "Not found" });
    return null;
  }
  if (!ownsNote(row, userId)) {
    res.status(403).json({ error: "Forbidden" });
    return null;
  }
  return row;
}

/** Where the share link points; the web app serves `/share/:token`. */
const webOrigin = process.env.WEB_ORIGIN ?? "http://localhost:3000";

/**
 * Notes CRUD, mounted at `/api/notes`. Every route is gated by the supplied auth middleware.
 * List/get select metadata columns only — never the CRDT blob in `note_doc` (slice 04).
 */
export function notesRouter(requireAuthMw: RequestHandler): Router {
  const router = Router();
  router.use(requireAuthMw);

  // POST /api/notes — create an owned note with defaults (Untitled / private). The client may mint the
  // id (crypto.randomUUID) and send it for offline-stable identity (ADR-0006): an optional, additive
  // field, so the flag-off client that sends no id keeps today's server-generated behavior.
  router.post(
    "/",
    authed(async (req, res, userId) => {
      // Present-but-malformed id → 422 (never coerced); absent id → server-generated path.
      const parsed = createNoteArgsSchema.partial().safeParse(req.body ?? {});
      if (!parsed.success) {
        res.status(422).json({ error: "Invalid note id", issues: parsed.error.issues });
        return;
      }
      const { id } = parsed.data;

      if (!id) {
        const [created] = await db.insert(note).values({ ownerId: userId }).returning({
          id: note.id,
          title: note.title,
          access: note.access,
          updatedAt: note.updatedAt,
        });
        res.status(201).json(created);
        return;
      }

      // Client-supplied id: idempotent create with an owner-on-conflict fail-safe (ADR-0006).
      const result = await createNoteRecord(userId, id);
      if (result.status === "conflict") {
        res.status(409).json({ error: "Note id already exists" });
        return;
      }
      res.status(201).json(result.row);
    }),
  );

  // GET /api/notes?filter=active|archived|trashed&label=<id> — list the caller's owned notes for
  // one lifecycle view, newest first (metadata only), each with its embedded labels[]. Default
  // filter is `active` (archived/trashed excluded). A `label` param implies the active view and
  // filters to notes carrying that label. Trash-view rows carry `labels: []` (goal #11).
  router.get(
    "/",
    authed(async (req, res, userId) => {
      const parsed = noteListQuerySchema.safeParse(req.query);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid query", issues: parsed.error.issues });
        return;
      }
      const { label: labelId } = parsed.data;
      // A label filter only ever applies to active notes.
      const filter = labelId ? "active" : parsed.data.filter;

      const conds = [eq(note.ownerId, userId)];
      if (filter === "active") {
        conds.push(isNull(note.archivedAt), isNull(note.trashedAt));
      } else if (filter === "archived") {
        conds.push(isNotNull(note.archivedAt), isNull(note.trashedAt));
      } else {
        conds.push(isNotNull(note.trashedAt));
      }
      if (labelId) {
        conds.push(
          exists(
            db
              .select({ one: sql`1` })
              .from(noteLabel)
              .where(and(eq(noteLabel.noteId, note.id), eq(noteLabel.labelId, labelId))),
          ),
        );
      }

      const rows = await db
        .select({
          id: note.id,
          title: note.title,
          preview: note.preview,
          access: note.access,
          updatedAt: note.updatedAt,
        })
        .from(note)
        .where(and(...conds))
        .orderBy(desc(note.updatedAt));

      // Embed labels[] with one grouped query over note_label ⋈ label for the page's ids (no N+1).
      // Trash view shows no chips, so skip the query and return empty arrays.
      const labelsByNote = new Map<string, { id: string; name: string; color: string }[]>();
      if (filter !== "trashed" && rows.length > 0) {
        const links = await db
          .select({
            noteId: noteLabel.noteId,
            id: label.id,
            name: label.name,
            color: label.color,
          })
          .from(noteLabel)
          .innerJoin(label, eq(noteLabel.labelId, label.id))
          .where(
            inArray(
              noteLabel.noteId,
              rows.map((r) => r.id),
            ),
          )
          .orderBy(label.name);
        for (const link of links) {
          const list = labelsByNote.get(link.noteId) ?? [];
          list.push({ id: link.id, name: link.name, color: link.color });
          labelsByNote.set(link.noteId, list);
        }
      }

      res.json(rows.map((r) => ({ ...r, labels: labelsByNote.get(r.id) ?? [] })));
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
          ownerName: user.name,
        })
        .from(noteCollaborator)
        .innerJoin(note, eq(noteCollaborator.noteId, note.id))
        .innerJoin(user, eq(note.ownerId, user.id))
        .where(
          and(
            eq(noteCollaborator.userId, userId),
            eq(noteCollaborator.status, "active"),
            ne(note.access, "private"),
            // A trashed note disappears from collaborators' "Shared with me" (ADR-005).
            isNull(note.trashedAt),
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
      const parsed = shareNoteBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res
          .status(400)
          .json({ error: "level must be 'view' or 'edit'", issues: parsed.error.issues });
        return;
      }
      const { level } = parsed.data;
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
      await setNoteShareLevel(db, id, level, token);
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
        await makeNotePrivate(tx, id);
      });
      await bustNotePermissions(permCache, id);
      await redisPublisher?.publish(revokeChannel(id), JSON.stringify({ reason: "made_private" }));
      res.status(204).end();
    }),
  );

  // POST /api/notes/:id/archive — owner only; set archived_at = now(). No collaborator/socket
  // impact (archive is purely the owner's organization; ADR-005).
  router.post(
    "/:id/archive",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!(await requireOwnedNote(id, userId, res))) return;
      await archiveNote(db, id);
      res.status(204).end();
    }),
  );

  // POST /api/notes/:id/unarchive — owner only; clear archived_at (back to active).
  router.post(
    "/:id/unarchive",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!(await requireOwnedNote(id, userId, res))) return;
      await unarchiveNote(db, id);
      res.status(204).end();
    }),
  );

  // POST /api/notes/:id/trash — owner only; soft-delete (set trashed_at = now()). Busts the note's
  // cached permissions so non-owners resolve to `none` on their next read/reconnect. No revoke
  // publish — kicking already-connected collaborators is future work (ADR-005).
  router.post(
    "/:id/trash",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!(await requireOwnedNote(id, userId, res))) return;
      await trashNote(db, id);
      await bustNotePermissions(permCache, id);
      res.status(204).end();
    }),
  );

  // POST /api/notes/:id/restore — owner only; clear both timestamps (back to active). Sharing
  // resumes unchanged (token not rotated); busts perms so collaborators regain access.
  router.post(
    "/:id/restore",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      if (!(await requireOwnedNote(id, userId, res))) return;
      await restoreNote(db, id);
      await bustNotePermissions(permCache, id);
      res.status(204).end();
    }),
  );

  // PUT /api/notes/:id/labels — owner only; replace the note's whole label set. Only the owner's
  // own labels are attached (client-supplied ids are filtered), so you can't attach someone else's.
  router.put(
    "/:id/labels",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const parsed = setNoteLabelsBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid labels", issues: parsed.error.issues });
        return;
      }
      if (!(await requireOwnedNote(id, userId, res))) return;

      const { labelIds } = parsed.data;
      await db.transaction(async (tx) => {
        await tx.delete(noteLabel).where(eq(noteLabel.noteId, id));
        if (labelIds.length > 0) {
          const owned = await tx
            .select({ id: label.id })
            .from(label)
            .where(and(eq(label.ownerId, userId), inArray(label.id, labelIds)));
          if (owned.length > 0) {
            await tx.insert(noteLabel).values(owned.map((l) => ({ noteId: id, labelId: l.id })));
          }
        }
      });
      res.status(204).end();
    }),
  );

  // PUT /api/notes/:id/content — the content lane (spec 20, ADR-0008). A private note flushes its full
  // Yjs state here (no socket): decode the blob, upsert the same note_doc row Hocuspocus writes, derive
  // title/preview via the SHARED helper (server-authoritative — the client never sends them), and bump
  // meta_version so the metadata lane's pull surfaces the change. Gated on edit permission (resolvePerm),
  // not owner-check, so REST and socket agree on who may write; a brief overlap is safe (both write
  // CRDT-convergent full-state blobs), but the single-writer invariant is enforced client-side.
  router.put(
    "/:id/content",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const parsed = putNoteContentBodySchema.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "Invalid content", issues: parsed.error.issues });
        return;
      }
      // Unknown notes resolve to `none`, so this also 403s a missing id (deny-by-default).
      if ((await resolvePerm(id, userId)) !== "edit") {
        res.status(403).json({ error: "Forbidden" });
        return;
      }
      const state = Buffer.from(parsed.data.state, "base64");
      await db
        .insert(noteDoc)
        .values({ noteId: id, state })
        .onConflictDoUpdate({ target: noteDoc.noteId, set: { state, updatedAt: new Date() } });

      const doc = new Y.Doc();
      Y.applyUpdate(doc, new Uint8Array(state));
      const { title, preview } = deriveNoteMetadata(doc);
      await db
        .update(note)
        .set({ title, preview, updatedAt: new Date(), metaVersion: sql`${note.metaVersion} + 1` })
        .where(eq(note.id, id));
      res.status(204).end();
    }),
  );

  // DELETE /api/notes/:id — owner-only PERMANENT delete. Reachable only from Trash: 409 unless the
  // note is already trashed (guards against nuking an active note). Cascades to note_doc /
  // note_collaborator / note_label via FKs.
  router.delete(
    "/:id",
    authed(async (req, res, userId) => {
      const { id } = req.params;
      if (!id) {
        res.status(404).json({ error: "Not found" });
        return;
      }
      const row = await requireOwnedNote(id, userId, res);
      if (!row) return;
      if (row.trashedAt === null) {
        res.status(409).json({ error: "Note must be trashed before permanent deletion" });
        return;
      }
      await permanentlyDeleteNote(db, id);
      res.status(204).end();
    }),
  );

  return router;
}
